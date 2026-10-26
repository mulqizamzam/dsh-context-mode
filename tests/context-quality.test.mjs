import test from "node:test";
import assert from "node:assert/strict";
import { compactText, assessQuality, recoverContext, estimateTokens, recommendContextBudget, adaptiveCompactText, planContextRetrieval } from "../lib/context-quality.mjs";
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

test("adaptive compaction is held when no quality audit basis exists", () => {
  const source = "INFO: routine line one\nINFO: routine line two";
  const result = adaptiveCompactText({ task: "Summarize routine output", source });
  assert.equal(result.status, "held-no-audit-basis");
  assert.equal(result.text, source);
  assert.equal(result.compactionStats, null);
  assert.equal(result.budget.qualityGateStatus, "insufficient-checks");
});

test("adaptive compaction selects a budget, audits its output, and returns retained evidence", () => {
  const source = [
    "INFO: service booted",
    "INFO: service booted",
    "ERROR: permission denied at src/app.mjs",
    "Expected 4 records, actual 3",
    "INFO: shutdown complete",
  ].join("\n");
  const result = adaptiveCompactText({
    task: "Compact this short permission error report",
    source,
    requiredFacts: ["permission denied", "src/app.mjs", "Expected 4 records, actual 3"],
  });
  assert.equal(result.status, "compacted");
  assert.equal(result.finalQualityAudit.status, "pass");
  assert.match(result.text, /permission denied/);
  assert.match(result.text, /Expected 4 records, actual 3/);
  assert.equal(result.budget.compactionCanProceedToAudit, true);
});

test("adaptive compaction never returns a lossy compact result as the final text after failed recovery", () => {
  const source = [
    ...Array.from({ length: 180 }, (_, i) => "INFO: worker heartbeat item " + String(i + 1).padStart(3, "0")),
    "prefix value split",
    "across source lines",
    ...Array.from({ length: 180 }, (_, i) => "INFO: worker cleanup item " + String(i + 1).padStart(3, "0")),
  ].join("\n");
  const result = adaptiveCompactText({
    task: "Investigate a long background worker log",
    source,
    requiredFacts: ["value split across"],
  });
  if (result.status === "fallback-full-source") {
    assert.equal(result.text, source);
    assert.equal(result.finalQualityAudit.qualityGatePassed, false);
  } else {
    assert.equal(result.finalQualityAudit.qualityGatePassed, true);
  }
});

test("adaptive compaction CLI returns a safe held status without an audit basis", () => {
  const source = "INFO: only routine output";
  const run = spawnSync(process.execPath, [join(root, "scripts/context-quality.mjs"), "adaptive-compact"], {
    input: JSON.stringify({ task: "Summarize", source }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.status, "held-no-audit-basis");
  assert.equal(result.text, source);
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

test("retrieval planner prioritizes exact failure search for debugging", () => {
  const result = planContextRetrieval({
    task: "Investigate the root cause of ERROR: token refresh failed in auth middleware",
    knownPaths: ["src/auth/refresh.mjs"],
    availableTools: ["ctx_search", "ctx_execute", "ctx_index"],
    indexStatus: "available",
  });
  assert.equal(result.mode, "plan-only");
  assert.equal(result.taskType, "debugging");
  assert.equal(result.toolAvailability.known, true);
  assert.ok(result.searchTerms.includes("token"));
  assert.ok(result.steps.some((step) => step.toolCandidates.includes("ctx_search")));
  assert.ok(result.steps.some((step) => /named paths/i.test(step.action)));
  assert.ok(result.guardrails.some((rule) => /no file reads/i.test(rule)));
});

test("retrieval planner avoids searching a known-empty index and recommends bounded indexing", () => {
  const result = planContextRetrieval({
    task: "Debug the database migration regression",
    indexStatus: "empty",
    availableTools: ["ctx_search", "ctx_index"],
  });
  assert.equal(result.steps.some((step) => step.toolCandidates.includes("ctx_search")), false);
  assert.ok(result.steps.some((step) => step.toolCandidates.includes("ctx_index")));
});

test("retrieval planner requires runtime tool verification when availability is omitted", () => {
  const result = planContextRetrieval({ task: "Explain how authentication middleware works" });
  assert.equal(result.toolAvailability.known, false);
  assert.equal(result.toolAvailability.mustVerifyBeforeExecution, true);
  assert.match(result.toolAvailability.note, /verify/i);
  assert.ok(result.steps.length >= 2);
  assert.ok(result.steps.length <= 4);
});

test("retrieval planner filters candidates to the provided runtime tool list", () => {
  const result = planContextRetrieval({
    task: "Implement a small retry feature",
    availableTools: ["ctx_stats"],
    indexStatus: "available",
  });
  assert.equal(result.steps.some((step) => step.toolCandidates.length > 0), false);
  assert.equal(result.toolAvailability.known, true);
});

test("retrieval planner validates inputs", () => {
  assert.throws(() => planContextRetrieval({ task: "" }), /non-empty string/);
  assert.throws(() => planContextRetrieval({ task: "debug", knownPaths: [42] }), /knownPaths/);
  assert.throws(() => planContextRetrieval({ task: "debug", availableTools: "ctx_search" }), /availableTools/);
  assert.throws(() => planContextRetrieval({ task: "debug", indexStatus: "maybe" }), /indexStatus/);
  assert.throws(() => planContextRetrieval({ task: "debug", maxSteps: 7 }), /maxSteps/);
});

test("retrieval planner CLI emits a machine-readable plan without executing retrieval", () => {
  const run = spawnSync(process.execPath, [join(root, "scripts/context-quality.mjs"), "plan"], {
    input: JSON.stringify({
      task: "Investigate why session renewal failed",
      availableTools: ["ctx_search"],
      indexStatus: "available",
    }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.mode, "plan-only");
  assert.equal(result.taskType, "debugging");
  assert.ok(Array.isArray(result.steps));
  assert.ok(result.guardrails.some((rule) => /Plan only/i.test(rule)));
});



test("quality assessment rejects required facts found only as substrings of larger tokens", () => {
  const result = assessQuality({
    source: "auth middleware protects the endpoint",
    compact: "oauth middleware protects the endpoint",
    requiredFacts: ["auth"],
  });
  assert.equal(result.status, "fail");
  assert.equal(result.qualityGatePassed, false);
  assert.deepEqual(result.missingFacts, ["auth"]);
  assert.equal(result.requiredFactRetention, 0);
});

test("quality assessment respects numeric token boundaries", () => {
  const result = assessQuality({
    source: "Observed status 401 from the gateway",
    compact: "Observed status 4010 from the gateway",
    requiredFacts: ["401"],
  });
  assert.equal(result.status, "fail");
  assert.deepEqual(result.missingFacts, ["401"]);
});

test("quality evidence matching remains case- and whitespace-insensitive", () => {
  const result = assessQuality({
    source: "Permission denied at src/auth.mjs",
    compact: "[L1] PERMISSION   DENIED at src/auth.mjs",
    requiredFacts: ["permission denied", "src/auth.mjs"],
  });
  assert.equal(result.status, "pass");
  assert.equal(result.qualityGatePassed, true);
});

test("budget and recovery use strict whole-token matching consistently", () => {
  const source = "oauth middleware is enabled";
  const budget = recommendContextBudget({ task: "Check auth middleware", source, requiredFacts: ["auth"] });
  assert.equal(budget.qualityGateStatus, "required-facts-not-in-source");
  assert.equal(budget.compactionCanProceedToAudit, false);

  const recovery = recoverContext({ source, compact: "short output", requiredFacts: ["auth"] });
  assert.deepEqual(recovery.unresolvedFacts, ["auth"]);
  assert.equal(recovery.requiresFullSourceFallback, true);
});


test("CLI help is available without JSON input and documents human-readable output", () => {
  const run = spawnSync(process.execPath, [join(root, "scripts/context-quality.mjs"), "--help"], { encoding: "utf8" });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /Usage:/);
  assert.match(run.stdout, /--text/);
  assert.match(run.stdout, /Insufficient checks/);
  assert.equal(run.stderr, "");
});

test("CLI gives actionable guidance for unknown mode, empty input, invalid JSON, and non-object JSON", () => {
  const script = join(root, "scripts/context-quality.mjs");
  const unknown = spawnSync(process.execPath, [script, "wat"], { input: "{}", encoding: "utf8" });
  assert.equal(unknown.status, 2);
  assert.match(unknown.stderr, /Unknown mode: wat/);
  assert.match(unknown.stderr, /--help/);

  const empty = spawnSync(process.execPath, [script, "quality"], { input: "   ", encoding: "utf8" });
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /No JSON input received/);

  const invalid = spawnSync(process.execPath, [script, "quality"], { input: "{broken", encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Invalid JSON on stdin/);

  const nonObject = spawnSync(process.execPath, [script, "quality"], { input: "null", encoding: "utf8" });
  assert.equal(nonObject.status, 2);
  assert.match(nonObject.stderr, /Input must be a JSON object/);
});

test("quality CLI uses explicit exit codes for pass, fail, and insufficient checks", () => {
  const script = join(root, "scripts/context-quality.mjs");
  const pass = spawnSync(process.execPath, [script, "quality"], {
    input: JSON.stringify({ source: "ERROR: permission denied", compact: "ERROR: permission denied", requiredFacts: ["permission denied"] }),
    encoding: "utf8",
  });
  assert.equal(pass.status, 0, pass.stderr);
  assert.equal(JSON.parse(pass.stdout).status, "pass");

  const fail = spawnSync(process.execPath, [script, "quality"], {
    input: JSON.stringify({ source: "ERROR: permission denied", compact: "Request ended", requiredFacts: ["permission denied"] }),
    encoding: "utf8",
  });
  assert.equal(fail.status, 1);
  assert.equal(JSON.parse(fail.stdout).status, "fail");

  const insufficient = spawnSync(process.execPath, [script, "quality"], {
    input: JSON.stringify({ source: "ordinary prose", compact: "short prose" }),
    encoding: "utf8",
  });
  assert.equal(insufficient.status, 3);
  assert.equal(JSON.parse(insufficient.stdout).status, "insufficient-checks");
});

test("CLI --text is opt-in and leaves default JSON output machine-readable", () => {
  const script = join(root, "scripts/context-quality.mjs");
  const input = JSON.stringify({ source: "ERROR: permission denied", compact: "ERROR: permission denied", requiredFacts: ["permission denied"] });
  const jsonRun = spawnSync(process.execPath, [script, "quality"], { input, encoding: "utf8" });
  assert.equal(jsonRun.status, 0);
  assert.equal(JSON.parse(jsonRun.stdout).status, "pass");

  const textRun = spawnSync(process.execPath, [script, "quality", "--text"], { input, encoding: "utf8" });
  assert.equal(textRun.status, 0);
  assert.match(textRun.stdout, /QUALITY GATE: PASS/);
  assert.match(textRun.stdout, /Required facts retained: 1 \/ 1/);
  assert.throws(() => JSON.parse(textRun.stdout));
});

test("adaptive compaction text output explains a safe hold and includes the unchanged source", () => {
  const source = "INFO: routine output";
  const run = spawnSync(process.execPath, [join(root, "scripts/context-quality.mjs"), "adaptive-compact", "--text"], {
    input: JSON.stringify({ task: "Summarize routine output", source }),
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /ADAPTIVE COMPACTION: HELD-NO-AUDIT-BASIS/);
  assert.match(run.stdout, /evidence was insufficient/i);
  assert.match(run.stdout, /INFO: routine output/);
});
