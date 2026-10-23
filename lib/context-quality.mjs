/**
 * Deterministic, dependency-free helpers for quality-aware context reduction.
 * Token counts are explicitly rough estimates (characters / 4), not tokenizer counts.
 */

const CRITICAL_LINE = /\b(error|errors|warn|warning|failed|failure|fatal|exception|traceback|stack trace|assertion|panic|denied|timeout|timed out|caused by|segmentation fault|out of memory|must not|must|required|expected|actual)\b/i;

function asText(value, name) {
  if (typeof value !== "string") throw new TypeError(`${name} must be a string`);
  return value;
}

function normalized(value) {
  return String(value).toLocaleLowerCase("en-US").replace(/\s+/g, " ").trim();
}

export function estimateTokens(text) {
  asText(text, "text");
  // Portable heuristic only. Actual tokenization depends on the model/tokenizer.
  return text.length === 0 ? 0 : Math.ceil(text.length / 4);
}

function groupConsecutiveLines(source) {
  const lines = source.split(/\r?\n/);
  const records = [];
  for (let i = 0; i < lines.length; i += 1) {
    const value = lines[i];
    const prev = records.at(-1);
    // Collapse only exact, consecutive, non-empty duplicates. Non-consecutive
    // duplicates and blank lines are retained because order/position can matter.
    if (value !== "" && prev && prev.text === value) {
      prev.endLine = i + 1;
      prev.count += 1;
      prev.critical ||= CRITICAL_LINE.test(value);
    } else {
      records.push({
        startLine: i + 1,
        endLine: i + 1,
        count: 1,
        text: value,
        critical: CRITICAL_LINE.test(value),
      });
    }
  }
  return { lines, records };
}

function rangesFor(records) {
  const ranges = [];
  for (const record of records) {
    const last = ranges.at(-1);
    if (last && record.startLine <= last.endLine + 1) last.endLine = Math.max(last.endLine, record.endLine);
    else ranges.push({ startLine: record.startLine, endLine: record.endLine });
  }
  return ranges;
}

function selectRecords(records, { maxLines, headLines, tailLines }) {
  if (records.length <= maxLines) return new Set(records.map((_, index) => index));
  const selected = new Set();
  records.forEach((record, index) => { if (record.critical) selected.add(index); });
  for (let i = 0; i < Math.min(headLines, records.length); i += 1) selected.add(i);
  for (let i = Math.max(0, records.length - tailLines); i < records.length; i += 1) selected.add(i);

  // Fill remaining capacity with evenly spaced representatives. Critical lines
  // always survive, even if that means exceeding maxLines.
  const target = Math.max(maxLines, selected.size);
  const candidates = records.map((_, index) => index).filter(index => !selected.has(index));
  const slots = target - selected.size;
  if (slots > 0 && candidates.length > 0) {
    for (let slot = 0; slot < slots && slot < candidates.length; slot += 1) {
      const candidateAt = Math.min(candidates.length - 1, Math.floor(((slot + 0.5) * candidates.length) / slots));
      selected.add(candidates[candidateAt]);
    }
  }
  return selected;
}

export function compactText(source, options = {}) {
  asText(source, "source");
  const maxLines = options.maxLines ?? 120;
  const headLines = options.headLines ?? 12;
  const tailLines = options.tailLines ?? 12;
  for (const [name, value] of Object.entries({ maxLines, headLines, tailLines })) {
    if (!Number.isInteger(value) || value < (name === "maxLines" ? 1 : 0)) {
      throw new RangeError(`${name} must be a valid non-negative integer (maxLines >= 1)`);
    }
  }

  const { lines, records } = groupConsecutiveLines(source);
  const selected = selectRecords(records, { maxLines, headLines, tailLines });
  const kept = records.filter((_, index) => selected.has(index));
  const omitted = records.filter((_, index) => !selected.has(index));
  const omittedRanges = rangesFor(omitted);
  const rendered = [];
  let previousRecord = null;
  for (const record of records) {
    const index = records.indexOf(record);
    if (!selected.has(index)) continue;
    if (previousRecord) {
      const gap = records.slice(records.indexOf(previousRecord) + 1, index).filter((_, offset) => !selected.has(records.indexOf(previousRecord) + 1 + offset));
      if (gap.length) {
        const gapRanges = rangesFor(gap);
        const count = gap.reduce((sum, item) => sum + item.count, 0);
        const rangeText = gapRanges.map(range => range.startLine === range.endLine ? `L${range.startLine}` : `L${range.startLine}-L${range.endLine}`).join(", ");
        rendered.push(`[… omitted ${count} source line(s), ${rangeText}; inspect the original source if needed …]`);
      }
    }
    const lineLabel = record.startLine === record.endLine ? `L${record.startLine}` : `L${record.startLine}-L${record.endLine}`;
    const repeatLabel = record.count > 1 ? ` (repeated ${record.count} times)` : "";
    rendered.push(`[${lineLabel}]${record.critical ? " [critical]" : ""}${repeatLabel} ${record.text}`);
    previousRecord = record;
  }
  if (omitted.length && !previousRecord) rendered.push("[… all non-critical lines omitted; increase maxLines or inspect the original source …]");
  const text = rendered.join("\n");
  return {
    text,
    stats: {
      sourceLines: lines.length,
      uniqueConsecutiveRecords: records.length,
      keptRecords: kept.length,
      omittedRecords: omitted.length,
      criticalRecords: records.filter(record => record.critical).length,
      omittedLineRanges: omittedRanges,
      sourceChars: source.length,
      compactChars: text.length,
      sourceTokenEstimate: estimateTokens(source),
      compactTokenEstimate: estimateTokens(text),
      tokenSavingsEstimate: estimateTokens(source) === 0 ? 0 : 1 - estimateTokens(text) / estimateTokens(source),
      tokenEstimateNote: "Approximation using ceil(characters / 4); not actual model-token accounting.",
    },
  };
}

function extractCriticalLines(source) {
  const seen = new Set();
  const critical = [];
  source.split(/\r?\n/).forEach((text, index) => {
    if (!CRITICAL_LINE.test(text)) return;
    const key = normalized(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    critical.push({ line: index + 1, text, normalized: key });
  });
  return critical;
}


const COMPLEX_TASK_SIGNALS = [
  {
    name: "root-cause investigation",
    pattern: /\b(root cause|debug(?:ging)?|investigat\w*|triage|diagnos\w*|incident|failure analysis)\b/i,
    points: 2,
  },
  {
    name: "cross-file or integration scope",
    pattern: /\b(cross[- ]file|architecture|architectural|multi[- ]module|multiple files|multiple modules|system[- ]wide|end[- ]to[- ]end|integration)\b/i,
    points: 2,
  },
  {
    name: "high-risk or stateful change",
    pattern: /\b(security|migration|regression|concurrency|race condition|deadlock|data loss|authentication|authorization|schema change)\b/i,
    points: 2,
  },
  {
    name: "verification-heavy task",
    pattern: /\b(benchmark|compare|validate|verify|test suite|acceptance criteria|reproduc(?:e|tion))\b/i,
    points: 1,
  },
];

/**
 * Recommend an advisory context budget from explicit task/source signals.
 * This does not change a model's actual context window or perform compaction.
 */
export function recommendContextBudget(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("input must be an object");
  }
  const {
    task = "",
    source = "",
    requiredFacts = [],
    changedFiles = 0,
    failedTests = 0,
    stackFrames = 0,
    complexityHint = "auto",
  } = input;

  asText(task, "task");
  asText(source, "source");
  if (!Array.isArray(requiredFacts) || requiredFacts.some((fact) => typeof fact !== "string" || !fact.trim())) {
    throw new TypeError("requiredFacts must be an array of non-empty strings");
  }
  for (const [name, value] of Object.entries({ changedFiles, failedTests, stackFrames })) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(name + " must be a non-negative integer");
  }
  if (!["auto", "low", "medium", "high"].includes(complexityHint)) {
    throw new TypeError("complexityHint must be one of: auto, low, medium, high");
  }

  const taskWords = task.match(/\b[\w-]+\b/g)?.length ?? 0;
  const sourceTokenEstimate = estimateTokens(source);
  const criticalLineCount = extractCriticalLines(source).length;
  const sourceNormalized = normalized(source);
  const requiredFactsInSource = requiredFacts.filter((fact) => sourceNormalized.includes(normalized(fact)));
  const missingRequiredFacts = requiredFacts.filter((fact) => !sourceNormalized.includes(normalized(fact)));
  const evidenceSignals = [];
  let score = 0;
  const addSignal = (name, points, evidence) => {
    if (points === 0) return;
    score += points;
    evidenceSignals.push({ name, points, evidence });
  };

  if (sourceTokenEstimate >= 8000) addSignal("large source volume", 3, String(sourceTokenEstimate) + " estimated source tokens");
  else if (sourceTokenEstimate >= 3000) addSignal("medium source volume", 2, String(sourceTokenEstimate) + " estimated source tokens");
  else if (sourceTokenEstimate >= 1000) addSignal("source volume", 1, String(sourceTokenEstimate) + " estimated source tokens");

  if (criticalLineCount >= 12) addSignal("many critical lines", 3, String(criticalLineCount) + " unique detected critical lines");
  else if (criticalLineCount >= 6) addSignal("several critical lines", 2, String(criticalLineCount) + " unique detected critical lines");
  else if (criticalLineCount >= 2) addSignal("critical lines present", 1, String(criticalLineCount) + " unique detected critical lines");

  if (requiredFacts.length >= 8) addSignal("many required facts", 2, String(requiredFacts.length) + " required facts");
  else if (requiredFacts.length >= 3) addSignal("multiple required facts", 1, String(requiredFacts.length) + " required facts");

  if (changedFiles >= 8) addSignal("broad file scope", 2, String(changedFiles) + " changed files");
  else if (changedFiles >= 3) addSignal("multi-file scope", 1, String(changedFiles) + " changed files");

  if (failedTests >= 5) addSignal("many failing tests", 2, String(failedTests) + " failing tests");
  else if (failedTests >= 2) addSignal("multiple failing tests", 1, String(failedTests) + " failing tests");

  if (stackFrames >= 12) addSignal("deep stack trace", 2, String(stackFrames) + " stack frames");
  else if (stackFrames >= 4) addSignal("stack trace evidence", 1, String(stackFrames) + " stack frames");

  if (taskWords >= 60) addSignal("long task specification", 2, String(taskWords) + " task words");
  else if (taskWords >= 30) addSignal("detailed task specification", 1, String(taskWords) + " task words");

  for (const signal of COMPLEX_TASK_SIGNALS) {
    if (signal.pattern.test(task)) addSignal(signal.name, signal.points, "Matched task description: " + signal.pattern.source);
  }

  if (complexityHint === "low") addSignal("explicit low-complexity hint", -2, "User supplied complexityHint=low; strong evidence signals can still raise the tier");
  else if (complexityHint === "medium") addSignal("explicit medium-complexity hint", 2, "User supplied complexityHint=medium");
  else if (complexityHint === "high") addSignal("explicit high-complexity hint", 6, "User supplied complexityHint=high");

  score = Math.max(0, score);
  const tier = score <= 1 ? "small" : score <= 4 ? "medium" : "large";
  const targetTokenBudget = { small: 2048, medium: 6144, large: 12288 }[tier];
  const hasSource = source.trim().length > 0;
  const hasAuditBasis = requiredFacts.length > 0 || criticalLineCount > 0;
  let qualityGateStatus;
  if (!hasSource) qualityGateStatus = "insufficient-source";
  else if (!hasAuditBasis) qualityGateStatus = "insufficient-checks";
  else if (missingRequiredFacts.length > 0) qualityGateStatus = "required-facts-not-in-source";
  else qualityGateStatus = "ready-for-audit";

  const strategyByTier = {
    small: [
      "Prefer deterministic extraction, exact field selection, or consecutive-duplicate removal.",
      "Keep source paths, exact values, errors, and task constraints.",
    ],
    medium: [
      "Keep all detected critical lines and task-required facts, then select focused source spans.",
      "Preserve line references and the original-source recovery path.",
      "Run the quality gate after compaction; recover missing evidence before answering.",
    ],
    large: [
      "Start with broader evidence rather than forcing a tight line cap.",
      "Split investigation into bounded phases and retain provenance between phases.",
      "Audit each reduced result and use targeted recovery on any missing evidence.",
    ],
  };

  return {
    policyVersion: "1.0.0",
    tier,
    complexityScore: score,
    targetTokenBudget,
    sourceTokenEstimate,
    taskWordCount: taskWords,
    criticalLineCount,
    requiredFactsCount: requiredFacts.length,
    requiredFactsFoundInSource: requiredFactsInSource,
    missingRequiredFacts,
    changedFiles,
    failedTests,
    stackFrames,
    complexityHint,
    evidenceSignals,
    qualityGateStatus,
    compactionCanProceedToAudit: qualityGateStatus === "ready-for-audit",
    strategy: strategyByTier[tier],
    guardrails: [
      "This is an advisory target, not a hard model context limit; it does not change DSH or model settings automatically.",
      "Run a source-backed quality audit after compaction and recover evidence if the audit fails.",
      "Do not claim quality-safe savings when the source is missing, required facts are not present in the supplied source, or there is no audit basis.",
      "Token counts use ceil(characters / 4) as a heuristic, not the model tokenizer.",
    ],
    caveat: "This deterministic heuristic recommends a budget from supplied signals. It does not call an LLM, read files, inspect Git, or compact content by itself.",
  };
}

/**
 * Adapt compaction intensity to the recommendation and fail back to the full
 * supplied source if the required evidence cannot be retained or recovered.
 */
export function adaptiveCompactText(input = {}) {
  const budget = recommendContextBudget(input);
  const source = input.source;
  const requiredFacts = input.requiredFacts ?? [];

  if (!budget.compactionCanProceedToAudit) {
    const reasonByStatus = {
      "insufficient-source": "No source was supplied; compaction was not attempted.",
      "insufficient-checks": "No source-backed audit basis was provided; compaction was held.",
      "required-facts-not-in-source": "One or more required facts are absent from the supplied source; compaction was held.",
    };
    return {
      policyVersion: "1.0.0",
      status: budget.qualityGateStatus === "insufficient-checks" ? "held-no-audit-basis"
        : budget.qualityGateStatus === "required-facts-not-in-source" ? "held-unverified-required-facts"
          : "held-no-source",
      text: source,
      budget,
      compactionStats: null,
      initialQualityAudit: null,
      recovery: null,
      finalQualityAudit: null,
      fallbackReason: reasonByStatus[budget.qualityGateStatus] ?? "Inputs are not ready for a quality audit.",
    };
  }

  const optionsByTier = {
    small: { maxLines: 24, headLines: 6, tailLines: 6 },
    medium: { maxLines: 64, headLines: 12, tailLines: 12 },
    large: { maxLines: 128, headLines: 20, tailLines: 20 },
  };
  const compacted = compactText(source, optionsByTier[budget.tier]);
  const initialQualityAudit = assessQuality({
    source,
    compact: compacted.text,
    requiredFacts,
  });

  if (initialQualityAudit.qualityGatePassed) {
    return {
      policyVersion: "1.0.0",
      status: "compacted",
      text: compacted.text,
      budget,
      compactionStats: compacted.stats,
      initialQualityAudit,
      recovery: null,
      finalQualityAudit: initialQualityAudit,
      fallbackReason: null,
    };
  }

  const recovery = recoverContext({
    source,
    compact: compacted.text,
    requiredFacts,
    contextLines: budget.tier === "small" ? 1 : budget.tier === "medium" ? 2 : 3,
  });
  const recoveryText = recovery.excerpts.map((excerpt) =>
    "[Recovered source L" + excerpt.startLine + "-L" + excerpt.endLine + "; " + excerpt.reasons.join("; ") + "]\n" + excerpt.text
  ).join("\n\n");
  const recoveredOutput = [compacted.text, recoveryText].filter(Boolean).join("\n\n");
  const finalQualityAudit = assessQuality({
    source,
    compact: recoveredOutput,
    requiredFacts,
  });

  if (finalQualityAudit.qualityGatePassed) {
    return {
      policyVersion: "1.0.0",
      status: "compacted-with-recovery",
      text: recoveredOutput,
      budget,
      compactionStats: compacted.stats,
      initialQualityAudit,
      recovery,
      finalQualityAudit,
      fallbackReason: null,
    };
  }

  return {
    policyVersion: "1.0.0",
    status: "fallback-full-source",
    text: source,
    budget,
    compactionStats: compacted.stats,
    initialQualityAudit,
    recovery,
    finalQualityAudit,
    fallbackReason: "The post-compaction quality audit did not pass after targeted recovery; retained the full supplied source instead.",
  };
}

export function assessQuality({ source, compact, requiredFacts = [], minimumRetention = 1 }) {
  asText(source, "source");
  asText(compact, "compact");
  if (!Array.isArray(requiredFacts) || requiredFacts.some(fact => typeof fact !== "string" || !fact.trim())) {
    throw new TypeError("requiredFacts must be an array of non-empty strings");
  }
  if (typeof minimumRetention !== "number" || minimumRetention < 0 || minimumRetention > 1) {
    throw new RangeError("minimumRetention must be between 0 and 1");
  }

  const compactNormalized = normalized(compact);
  const facts = requiredFacts.map(fact => ({ fact, retained: compactNormalized.includes(normalized(fact)) }));
  const retainedFacts = facts.filter(item => item.retained).length;
  const criticalLines = extractCriticalLines(source);
  const retainedCritical = criticalLines.filter(item => compactNormalized.includes(normalized(item.text))).length;
  const requiredFactRetention = facts.length ? retainedFacts / facts.length : null;
  const criticalLineRetention = criticalLines.length ? retainedCritical / criticalLines.length : null;
  const retentionBasis = requiredFactRetention !== null ? requiredFactRetention : criticalLineRetention;
  const sourceTokenEstimate = estimateTokens(source);
  const compactTokenEstimate = estimateTokens(compact);
  const tokenSavingsEstimate = sourceTokenEstimate === 0 ? 0 : 1 - compactTokenEstimate / sourceTokenEstimate;
  const missingFacts = facts.filter(item => !item.retained).map(item => item.fact);
  const missingCriticalLines = criticalLines.filter(item => !compactNormalized.includes(normalized(item.text))).map(item => ({ line: item.line, text: item.text }));

  return {
    status: retentionBasis === null ? "insufficient-checks" : (retentionBasis >= minimumRetention && missingFacts.length === 0 && missingCriticalLines.length === 0 ? "pass" : "fail"),
    qualityGatePassed: retentionBasis !== null && retentionBasis >= minimumRetention && missingFacts.length === 0 && missingCriticalLines.length === 0,
    sourceTokenEstimate,
    compactTokenEstimate,
    tokenSavingsEstimate,
    tokenSavingsPercentEstimate: Math.round(tokenSavingsEstimate * 10000) / 100,
    requiredFactRetention,
    retainedRequiredFacts: retainedFacts,
    totalRequiredFacts: facts.length,
    missingFacts,
    criticalLineRetention,
    retainedUniqueCriticalLines: retainedCritical,
    totalUniqueCriticalLines: criticalLines.length,
    missingCriticalLines,
    retentionAdjustedSavingsProxy: retentionBasis === null ? null : tokenSavingsEstimate * retentionBasis,
    caveat: "Retention and savings are deterministic proxies, not a guarantee of answer correctness. Token counts are approximate; validate task success on representative tasks.",
  };
}

export function recoverContext({ source, compact, requiredFacts = [], contextLines = 2 }) {
  asText(source, "source");
  asText(compact, "compact");
  if (!Array.isArray(requiredFacts) || requiredFacts.some(fact => typeof fact !== "string" || !fact.trim())) {
    throw new TypeError("requiredFacts must be an array of non-empty strings");
  }
  if (!Number.isInteger(contextLines) || contextLines < 0 || contextLines > 50) {
    throw new RangeError("contextLines must be an integer between 0 and 50");
  }

  const sourceLines = source.split(/\r?\n/);
  const compactNormalized = normalized(compact);
  const missingFacts = requiredFacts.filter(fact => !compactNormalized.includes(normalized(fact)));
  const ranges = [];
  const recoveredFacts = [];
  const unresolvedFacts = [];
  const pushRange = (line, reason) => {
    ranges.push({ startLine: Math.max(1, line - contextLines), endLine: Math.min(sourceLines.length, line + contextLines), reasons: [reason] });
  };

  for (const fact of missingFacts) {
    const index = sourceLines.findIndex(line => normalized(line).includes(normalized(fact)));
    if (index < 0) unresolvedFacts.push(fact);
    else {
      pushRange(index + 1, `required fact: ${fact}`);
      recoveredFacts.push(fact);
    }
  }

  for (const critical of extractCriticalLines(source)) {
    if (!compactNormalized.includes(normalized(critical.text))) pushRange(critical.line, "critical source line omitted from compact output");
  }

  ranges.sort((a, b) => a.startLine - b.startLine);
  const merged = [];
  for (const range of ranges) {
    const prev = merged.at(-1);
    if (prev && range.startLine <= prev.endLine + 1) {
      prev.endLine = Math.max(prev.endLine, range.endLine);
      prev.reasons.push(...range.reasons);
    } else merged.push({ ...range, reasons: [...range.reasons] });
  }
  const excerpts = merged.map(range => ({
    startLine: range.startLine,
    endLine: range.endLine,
    reasons: [...new Set(range.reasons)],
    text: sourceLines.slice(range.startLine - 1, range.endLine).map((line, offset) => `${range.startLine + offset}: ${line}`).join("\n"),
  }));

  return {
    excerpts,
    recoveredFacts: [...new Set(recoveredFacts)],
    unresolvedFacts,
    requiresFullSourceFallback: unresolvedFacts.length > 0,
    fullSourceFallbackReason: unresolvedFacts.length ? "One or more required facts could not be located in the supplied source; verify the source/version or inspect the full relevant source." : null,
    sourceLineCount: sourceLines.length,
    caveat: "Recovery excerpts are grounded only in the source supplied to this function; they do not retrieve external files or prove that the supplied source is complete.",
  };
}
