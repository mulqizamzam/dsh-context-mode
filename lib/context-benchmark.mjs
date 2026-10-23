import { compactText, assessQuality, recoverContext, estimateTokens } from "./context-quality.mjs";
import { createBenchmarkTasks } from "../benchmarks/tasks.mjs";

const round2 = (value) => Math.round(value * 100) / 100;
const pct = (value) => round2(value * 100);

function recoveryText(recovery) {
  return recovery.excerpts.map((excerpt) =>
    `[Recovered source L${excerpt.startLine}-L${excerpt.endLine}; ${excerpt.reasons.join("; ")}]\n${excerpt.text}`
  ).join("\n\n");
}

export function runContextBenchmark(tasks = createBenchmarkTasks()) {
  const results = tasks.map((task) => {
    const full = assessQuality({
      source: task.source,
      compact: task.source,
      requiredFacts: task.requiredFacts,
    });
    const compacted = compactText(task.source, task.options);
    const compactAudit = assessQuality({
      source: task.source,
      compact: compacted.text,
      requiredFacts: task.requiredFacts,
    });
    const recovery = recoverContext({
      source: task.source,
      compact: compacted.text,
      requiredFacts: task.requiredFacts,
      contextLines: 1,
    });
    const recoveredOutput = [compacted.text, recoveryText(recovery)].filter(Boolean).join("\n\n");
    const recoveredAudit = assessQuality({
      source: task.source,
      compact: recoveredOutput,
      requiredFacts: task.requiredFacts,
    });
    const rawSavings = task.source.length === 0 ? 0 : 1 - compacted.text.length / task.source.length;
    const compactPass = compactAudit.status === "pass";
    const qualityAdjustedSavings = compactPass ? Math.max(0, rawSavings) : 0;
    return {
      id: task.id,
      task: task.task,
      expectedStatus: task.expectedStatus,
      fullContextStatus: full.status,
      compactContextStatus: compactAudit.status,
      expectationMet: compactAudit.status === task.expectedStatus,
      sourceLines: compacted.stats.sourceLines,
      compactLines: compacted.text.split(/\r?\n/).length,
      sourceCharacters: task.source.length,
      compactCharacters: compacted.text.length,
      sourceTokenEstimate: estimateTokens(task.source),
      compactTokenEstimate: estimateTokens(compacted.text),
      rawCharacterReductionPercentEstimate: pct(rawSavings),
      rawTokenReductionPercentEstimate: compactAudit.tokenSavingsPercentEstimate,
      requiredFactRetention: compactAudit.requiredFactRetention,
      retainedRequiredFacts: compactAudit.retainedRequiredFacts,
      totalRequiredFacts: compactAudit.totalRequiredFacts,
      missingFacts: compactAudit.missingFacts,
      retainedCriticalLines: compactAudit.retainedUniqueCriticalLines,
      totalCriticalLines: compactAudit.totalUniqueCriticalLines,
      missingCriticalLines: compactAudit.missingCriticalLines.map((line) => line.line),
      qualityAdjustedSavingsPercentEstimate: pct(qualityAdjustedSavings),
      recoveryExcerpts: recovery.excerpts.length,
      recoveryUnresolvedFacts: recovery.unresolvedFacts,
      recoveredContextStatus: recoveredAudit.status,
      recoveredContextQualityGatePassed: recoveredAudit.qualityGatePassed,
    };
  });

  const expectationFailures = results.filter((result) => !result.expectationMet);
  const compactPasses = results.filter((result) => result.compactContextStatus === "pass");
  const fullPasses = results.filter((result) => result.fullContextStatus === "pass");
  const failures = results.filter((result) => result.compactContextStatus === "fail");
  const recoverableFailures = failures.filter((result) => result.recoveredContextQualityGatePassed);
  const mean = (values) => values.length ? round2(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;

  return {
    benchmarkVersion: "1.0.0",
    scope: "Deterministic evidence-retention benchmark. It does not call an LLM and does not measure semantic answer correctness or real model-token usage.",
    method: "Run the same synthetic task fixtures on full source and compacted source; audit required facts and critical source lines; apply targeted recovery and rerun the audit.",
    summary: {
      cases: results.length,
      expectedOutcomesMet: results.length - expectationFailures.length,
      fullContextAuditPasses: fullPasses.length,
      compactContextAuditPasses: compactPasses.length,
      compactContextAuditFailures: failures.length,
      compactContextInsufficientChecks: results.filter((result) => result.compactContextStatus === "insufficient-checks").length,
      meanRawCharacterReductionPercentEstimate: mean(results.map((result) => result.rawCharacterReductionPercentEstimate)),
      meanQualityAdjustedSavingsPercentEstimate: mean(results.map((result) => result.qualityAdjustedSavingsPercentEstimate)),
      failingCasesRecoveredToPass: recoverableFailures.length,
      totalFailingCases: failures.length,
    },
    expectationFailures: expectationFailures.map((result) => ({
      id: result.id,
      expected: result.expectedStatus,
      actual: result.compactContextStatus,
    })),
    results,
    caveats: [
      "Token counts are estimates based on ceil(characters / 4), not model tokenizers.",
      "The required-fact and critical-line audit is deterministic substring/evidence retention, not semantic correctness.",
      "Fixtures are synthetic and reproducible; results may not generalize to every repository or task.",
      "Full-context vs compact-context answer quality requires running the same tasks through an actual model and grading its answers; this benchmark does not do that.",
      "The quality-adjusted savings figure credits savings only when the deterministic compact-context audit passes; it is a conservative proxy, not an outcome-quality score.",
    ],
  };
}

export function formatContextBenchmark(report) {
  const s = report.summary;
  const lines = [
    "dsh-context-mode — Context Savings Benchmark",
    "Scope: deterministic evidence-retention only (no model calls).",
    "",
    `Cases: ${s.cases} | expectations met: ${s.expectedOutcomesMet}/${s.cases}`,
    `Full-context audit passed: ${s.fullContextAuditPasses}/${s.cases}`,
    `Compact audit passed: ${s.compactContextAuditPasses}/${s.cases}`,
    `Compact audit failed: ${s.compactContextAuditFailures} | insufficient checks: ${s.compactContextInsufficientChecks}`,
    `Mean raw character reduction (estimate): ${s.meanRawCharacterReductionPercentEstimate}%`,
    `Mean quality-adjusted savings (estimate): ${s.meanQualityAdjustedSavingsPercentEstimate}%`,
    `Failing cases recovered to pass: ${s.failingCasesRecoveredToPass}/${s.totalFailingCases}`,
    "",
    "Per-case results:",
  ];
  for (const item of report.results) {
    lines.push(
      `- ${item.id}: full=${item.fullContextStatus}, compact=${item.compactContextStatus}, ` +
      `raw savings≈${item.rawCharacterReductionPercentEstimate}%, quality-adjusted≈${item.qualityAdjustedSavingsPercentEstimate}%, ` +
      `recovered=${item.recoveredContextStatus}`
    );
    if (item.missingFacts.length) lines.push(`  missing facts: ${item.missingFacts.join("; ")}`);
  }
  if (report.expectationFailures.length) {
    lines.push("", "Unexpected benchmark outcomes:");
    for (const item of report.expectationFailures) lines.push(`- ${item.id}: expected ${item.expected}, got ${item.actual}`);
  }
  lines.push("", "Caveat: this is not an LLM semantic-quality or real-tokenization benchmark.");
  return lines.join("\n");
}
