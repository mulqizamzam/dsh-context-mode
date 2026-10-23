import test from "node:test";
import assert from "node:assert/strict";
import { compactText, assessQuality, recoverContext, estimateTokens, recommendContextBudget } from "../lib/context-quality.mjs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("compaction collapses only consecutive exact duplicates and preserves source line references", () => {
  const source = ["build started", "progress", "progress", "ERROR: cannot connect", "progress", "done"].join("\n");
  const result = compactText(source, { maxLines: 20 });
  assert.match(result.text, /L2-L3/);
  assert.match(result.text, /repeated 2 times/);
  assert.match(result.text, /\[L4\] \[critical\] ERROR: cannot connect/);
  assert.equal(result.stats.sourceLines, 6);
  assert.equal(result.stats.omittedRecords, 0);
});

test("all detected critical records survive a tight line cap", () => {
  const source = [
    ...Array.from({ length: 20 }, (_, i) => `INFO: heartbeat ${i}`),
    "FATAL: database is read-only",
    ...Array.from({ length: 20 }, (_, i) => `INFO: cleanup ${i}`),
    "ERROR: migration failed",
    ...Array.from({ length: 20 }, (_, i) => `INFO: tail ${i}`),
  ].join("\n");
  const result = compactText(source, { maxLines: 10, headLines: 2, tailLines: 2 });
  assert.match(result.text, /FATAL: database is read-only/);
  assert.match(result.text, /ERROR: migration failed/);
  assert.ok(result.stats.omittedRecords > 0);
  assert.ok(result.text.includes("omitted"));
});

test("quality assessment passes when critical facts and error evidence are retained", () => {
  const source = "Requirement: support Node 22\nERROR: permission denied at src/index.mjs:12\nExpected 3 rows, actual 2";
  const compact = "Requirement: support Node 22\nERROR: permission denied at src/index.mjs:12\nExpected 3 rows, actual 2";
  const result = assessQuality({ source, compact, requiredFacts: ["Node 22", "permission denied", "Expected 3 rows, actual 2"] });
  assert.equal(result.status, "pass");
  assert.equal(result.qualityGatePassed, true);
  assert.equal(result.requiredFactRetention, 1);
  assert.equal(result.tokenSavingsPercentEstimate, 0);
});

test("quality assessment fails if required facts are absent", () => {
  const result = assessQuality({ source: "Migration failed in accounts table", compact: "Migration failed", requiredFacts: ["accounts table", "Migration failed"] });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.missingFacts, ["accounts table"]);
  assert.equal(result.qualityGatePassed, false);
});

test("quality assessment refuses to claim a pass without any audit basis", () => {
  const result = assessQuality({ source: "ordinary unstructured prose", compact: "short prose" });
  assert.equal(result.status, "insufficient-checks");
  assert.equal(result.qualityGatePassed, false);
  assert.equal(result.retentionAdjustedSavingsProxy, null);
});

test("recovery returns source-grounded excerpts around missing facts", () => {
  const source = ["startup", "config loaded", "route /api/v1 failed", "ERROR: missing auth middleware", "request aborted", "shutdown"].join("\n");
  const compact = "startup\nshutdown";
  const result = recoverContext({ source, compact, requiredFacts: ["missing auth middleware"], contextLines: 1 });
  assert.deepEqual(result.recoveredFacts, ["missing auth middleware"]);
  assert.deepEqual(result.unresolvedFacts, []);
  assert.equal(result.requiresFullSourceFallback, false);
  assert.match(result.excerpts[0].text, /4: ERROR: missing auth middleware/);
  assert.match(result.excerpts[0].text, /3: route \/api\/v1 failed/);
});

test("recovery flags facts that cannot be found in the supplied source", () => {
  const result = recoverContext({ source: "old config has no matching key", compact: "short", requiredFacts: ["newSecretSetting"] });
  assert.deepEqual(result.unresolvedFacts, ["newSecretSetting"]);
  assert.equal(result.requiresFullSourceFallback, true);
});

test("adaptive budget recommends a small tier but blocks compaction without an audit basis", () => {
  const result = recommendContextBudget({
    task: "Fix a typo in one sentence.",
    source: "A short paragraph with no explicit critical evidence.",
  });
  assert.equal(result.tier, "small");
  assert.equal(result.targetTokenBudget, 2048);
  assert.equal(result.qualityGateStatus, "insufficient-checks");
  assert.equal(result.compactionCanProceedToAudit, false);
  assert.match(result.caveat, /does not call an LLM/);
});

test("adaptive budget scales up for complex, multi-file investigations", () => {
  const source = [
    ...Array.from({ length: 220 }, (_, i) => "INFO: worker item " + String(i + 1).padStart(3, "0") + " completed"),
    "ERROR: migration failed due to lock timeout in src/db/migrate.mjs",
    "FATAL: expected schema version 18, actual 17",
    ...Array.from({ length: 120 }, (_, i) => "INFO: cleanup record " + String(i + 1).padStart(3, "0")),
  ].join("\n");
  const result = recommendContextBudget({
    task: "Investigate the root cause of this cross-file migration regression and verify the test suite.",
    source,
    requiredFacts: ["migration failed", "lock timeout", "src/db/migrate.mjs", "schema version 18", "actual 17"],
    changedFiles: 9,
    failedTests: 4,
    stackFrames: 8,
  });
  assert.equal(result.tier, "large");
  assert.equal(result.targetTokenBudget, 12288);
  assert.equal(result.qualityGateStatus, "ready-for-audit");
  assert.equal(result.compactionCanProceedToAudit, true);
  assert.ok(result.complexityScore >= 6);
  assert.ok(result.evidenceSignals.length >= 4);
  assert.ok(result.strategy.some((step) => /broader evidence/i.test(step)));
});

test("adaptive budget fails closed when a requested fact is absent from supplied source", () => {
  const result = recommendContextBudget({
    task: "Investigate the config error",
    source: "ERROR: invalid configuration in src/config.mjs",
    requiredFacts: ["src/config.mjs", "the missing fallback key"],
  });
  assert.equal(result.qualityGateStatus, "required-facts-not-in-source");
  assert.deepEqual(result.missingRequiredFacts, ["the missing fallback key"]);
  assert.equal(result.compactionCanProceedToAudit, false);
});

test("adaptive budget validates its input instead of guessing from malformed metadata", () => {
  assert.throws(() => recommendContextBudget({ task: 42 }), /task must be a string/);
  assert.throws(() => recommendContextBudget({ changedFiles: -1 }), /changedFiles must be a non-negative integer/);
  assert.throws(() => recommendContextBudget({ complexityHint: "extreme" }), /complexityHint must be one of/);
});

test("budget CLI emits the deterministic recommendation as JSON", () => {
  const run = spawnSync(process.execPath, [join(root, "scripts/context-quality.mjs"), "budget"], {
    input: JSON.stringify({
      task: "Fix a typo in a sentence",
      source: "plain sentence text",
    }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.tier, "small");
  assert.equal(result.targetTokenBudget, 2048);
});

test("token counts are marked as a heuristic and handle empty input", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("12345"), 2);
});

test("CLI reads JSON from stdin and emits machine-readable compact output", () => {
  const run = spawnSync(process.execPath, [join(root, "scripts/context-quality.mjs"), "compact"], {
    input: JSON.stringify({ source: "INFO: start\nINFO: start\nERROR: permission denied" }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.match(result.text, /ERROR: permission denied/);
  assert.equal(result.stats.sourceLines, 3);
});
