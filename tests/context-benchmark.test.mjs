import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runContextBenchmark } from "../lib/context-benchmark.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("benchmark compares the same deterministic task fixtures across full and compact context", () => {
  const report = runContextBenchmark();
  assert.equal(report.summary.cases, 7);
  assert.equal(report.summary.expectedOutcomesMet, 7);
  assert.equal(report.expectationFailures.length, 0);
  assert.equal(report.summary.fullContextAuditPasses, 6);
  assert.equal(report.summary.compactContextAuditPasses, 5);
  assert.equal(report.summary.compactContextAuditFailures, 1);
  assert.equal(report.summary.compactContextInsufficientChecks, 1);
});

test("quality gate rejects a missing middle-of-log fact and targeted recovery restores it", () => {
  const report = runContextBenchmark();
  const item = report.results.find((result) => result.id === "middle-line-fact-loss");
  assert.equal(item.compactContextStatus, "fail");
  assert.deepEqual(item.missingFacts, ["deployment_region=eu-west-2"]);
  assert.equal(item.qualityAdjustedSavingsPercentEstimate, 0);
  assert.equal(item.recoveredContextStatus, "pass");
  assert.equal(item.recoveredContextQualityGatePassed, true);
});

test("unscoped routine output is not counted as a quality pass", () => {
  const report = runContextBenchmark();
  const item = report.results.find((result) => result.id === "no-audit-basis");
  assert.equal(item.fullContextStatus, "insufficient-checks");
  assert.equal(item.compactContextStatus, "insufficient-checks");
  assert.equal(item.qualityAdjustedSavingsPercentEstimate, 0);
});

test("benchmark credits savings only when the compact-context audit passes", () => {
  const report = runContextBenchmark();
  for (const item of report.results) {
    if (item.compactContextStatus !== "pass") {
      assert.equal(item.qualityAdjustedSavingsPercentEstimate, 0, item.id);
    }
  }
  assert.ok(report.summary.meanRawCharacterReductionPercentEstimate > 0);
  assert.ok(report.summary.meanQualityAdjustedSavingsPercentEstimate >= 0);
  assert.ok(report.summary.meanQualityAdjustedSavingsPercentEstimate < report.summary.meanRawCharacterReductionPercentEstimate);
});

test("benchmark reports adaptive budget tiers and fails closed without an audit basis", () => {
  const report = runContextBenchmark();
  const counts = report.summary.adaptiveBudgetTierCounts;
  assert.equal(counts.small + counts.medium + counts.large, report.summary.cases);
  assert.equal(
    report.summary.budgetCasesReadyForQualityAudit + report.summary.budgetCasesHeldForInsufficientEvidence,
    report.summary.cases,
  );
  const unscoped = report.results.find((result) => result.id === "no-audit-basis");
  assert.equal(unscoped.adaptiveBudget.tier.length > 0, true);
  assert.equal(unscoped.adaptiveBudget.qualityGateStatus, "insufficient-checks");
  assert.equal(unscoped.adaptiveBudget.compactionCanProceedToAudit, false);
});

test("adaptive compaction benchmark safely holds unscoped input and audits completed compactions", () => {
  const report = runContextBenchmark();
  const counts = report.summary;
  assert.equal(
    counts.adaptiveCompactionsCompleted +
      counts.adaptiveCompactionsHeld +
      counts.adaptiveCompactionsFellBackToFullSource,
    counts.cases,
  );

  const unscoped = report.results.find((result) => result.id === "no-audit-basis");
  assert.equal(unscoped.adaptiveCompaction.status, "held-no-audit-basis");
  assert.equal(unscoped.adaptiveCompaction.returnedFullSource, true);

  for (const item of report.results) {
    if (item.adaptiveCompaction.status === "compacted" || item.adaptiveCompaction.status === "compacted-with-recovery") {
      assert.equal(item.adaptiveCompaction.finalQualityGatePassed, true, item.id);
    }
    if (item.adaptiveCompaction.status === "fallback-full-source") {
      assert.equal(item.adaptiveCompaction.returnedFullSource, true, item.id);
    }
  }
});

test("benchmark CLI emits valid JSON and exits successfully for expected outcomes", () => {
  const run = spawnSync(process.execPath, [join(root, "scripts/context-benchmark.mjs"), "--json"], {
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.benchmarkVersion, "1.1.0");
  assert.equal(report.summary.expectedOutcomesMet, report.summary.cases);
  assert.match(report.scope, /does not call an LLM/);
  assert.ok(report.summary.adaptiveBudgetTierCounts);
  assert.match(run.stdout, /adaptiveBudgetTierCounts/);
});
