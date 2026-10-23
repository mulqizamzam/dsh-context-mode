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
