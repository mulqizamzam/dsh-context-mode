#!/usr/bin/env node
import { compactText, assessQuality, recoverContext, recommendContextBudget, adaptiveCompactText, planContextRetrieval } from "../lib/context-quality.mjs";

const MODES = ["compact", "quality", "recover", "budget", "adaptive-compact", "plan"];
const HELP = `dsh-context-quality — deterministic context helper

Usage:
  dsh-context-quality <mode> [--text] < input.json
  node scripts/context-quality.mjs <mode> [--text] < input.json
  dsh-context-quality --help

Modes:
  compact           Reduce repetitive text and report retained/omitted source lines
  quality           Audit required facts and detected critical evidence
  recover           Recover source excerpts around required facts
  budget            Recommend an advisory context budget
  adaptive-compact  Compact, audit, recover if needed, and fall back safely
  plan              Produce an advisory retrieval plan; does not execute tools

Output:
  JSON is the default for scripts and integrations.
  Add --text for a human-readable summary. The JSON/API result is unchanged.
  Input must be one JSON object on stdin; this command does not read files automatically.

Examples:
  printf '%s' '{"source":"INFO: start\\nERROR: permission denied"}' | dsh-context-quality compact --text
  printf '%s' '{"source":"ERROR: permission denied","compact":"ERROR: permission denied","requiredFacts":["permission denied"]}' | dsh-context-quality quality

Quality exit codes:
  0  Audit passed
  1  Audit failed: required facts or detected critical evidence are missing
  2  Usage, JSON, or input validation error
  3  Insufficient checks: not enough evidence to claim a pass

Adaptive compaction can return a successful safe hold/fallback result with the original
source unchanged. Always inspect the returned status; exit code 0 is not proof that
semantic correctness has been established.
`;

function percent(value) {
  return Number.isFinite(value) ? (value * 100).toFixed(1) + "%" : "n/a";
}
function count(value) {
  return Number.isInteger(value) ? String(value) : "n/a";
}
function listBlock(title, items, render = (item) => String(item)) {
  if (!Array.isArray(items) || items.length === 0) return [];
  return [title, ...items.map((item) => "  - " + render(item))];
}
function formatText(mode, result) {
  if (mode === "compact") {
    return [
      "COMPACTION RESULT",
      "Source lines: " + count(result.stats?.sourceLines),
      "Records kept / omitted: " + count(result.stats?.keptRecords) + " / " + count(result.stats?.omittedRecords),
      "Estimated token savings: " + percent(result.stats?.tokenSavingsEstimate) + " (characters/4 heuristic)",
      "",
      result.text || "(empty output)",
    ].join("\n");
  }
  if (mode === "quality") {
    const status = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "INSUFFICIENT CHECKS";
    const lines = [
      "QUALITY GATE: " + status,
      "Required facts retained: " + (result.totalRequiredFacts === 0 ? "not supplied" : count(result.retainedRequiredFacts) + " / " + count(result.totalRequiredFacts)),
      "Detected critical lines retained: " + (result.totalUniqueCriticalLines === 0 ? "none detected" : count(result.retainedUniqueCriticalLines) + " / " + count(result.totalUniqueCriticalLines)),
      "Estimated token savings: " + percent(result.tokenSavingsEstimate) + " (characters/4 heuristic)",
    ];
    lines.push(...listBlock("Missing required facts:", result.missingFacts));
    lines.push(...listBlock("Missing critical evidence:", result.missingCriticalLines, (item) => "L" + item.line + ": " + item.text));
    if (result.status === "insufficient-checks") lines.push("Next step: provide explicit requiredFacts or a source with detectable critical evidence.");
    lines.push("", "Note: a pass verifies only the literal evidence checked; it does not prove semantic correctness.");
    return lines.join("\n");
  }
  if (mode === "recover") {
    const lines = [
      "CONTEXT RECOVERY",
      "Recovered facts: " + count(result.recoveredFacts?.length),
      "Unresolved facts: " + count(result.unresolvedFacts?.length),
      "Full-source fallback required: " + (result.requiresFullSourceFallback ? "yes" : "no"),
    ];
    lines.push(...listBlock("Unresolved facts:", result.unresolvedFacts));
    for (const excerpt of result.excerpts ?? []) {
      lines.push("", "Recovered source L" + excerpt.startLine + "-L" + excerpt.endLine + " (" + excerpt.reasons.join("; ") + ")", excerpt.text);
    }
    return lines.join("\n");
  }
  if (mode === "budget") {
    const lines = [
      "CONTEXT BUDGET RECOMMENDATION",
      "Recommended tier: " + String(result.tier ?? "n/a").toUpperCase(),
      "Advisory target: " + count(result.targetTokenBudget) + " estimated tokens",
      "Quality readiness: " + String(result.qualityGateStatus ?? "n/a"),
      "Compaction may proceed to post-audit: " + (result.compactionCanProceedToAudit ? "yes" : "no"),
      "Source size estimate: " + count(result.sourceTokenEstimate) + " tokens (characters/4 heuristic)",
    ];
    lines.push(...listBlock("Missing required facts:", result.missingRequiredFacts));
    lines.push(...listBlock("Suggested strategy:", result.strategy));
    lines.push("", result.caveat ?? "This recommendation is advisory.");
    return lines.join("\n");
  }
  if (mode === "adaptive-compact") {
    const lines = [
      "ADAPTIVE COMPACTION: " + String(result.status ?? "unknown").toUpperCase(),
      "Budget tier: " + String(result.budget?.tier ?? "n/a"),
      "Initial quality audit: " + String(result.initialQualityAudit?.status ?? "not run"),
      "Final quality audit: " + String(result.finalQualityAudit?.status ?? "not run"),
    ];
    if (result.fallbackReason) lines.push("Reason: " + result.fallbackReason);
    lines.push("", "RESULTING TEXT", result.text ?? "(no source text)");
    if (String(result.status ?? "").startsWith("held-") || result.finalQualityAudit?.status === "insufficient-checks") {
      lines.push("", "Warning: evidence was insufficient to verify quality. Review the source before relying on this text.");
    }
    return lines.join("\n");
  }
  const lines = [
    "RETRIEVAL PLAN (ADVISORY; DOES NOT EXECUTE TOOLS)",
    "Task type: " + String(result.taskType ?? "n/a"),
    "Search terms: " + ((result.searchTerms ?? []).join(", ") || "(none)"),
    "Tool availability known: " + (result.toolAvailability?.known ? "yes" : "no; verify in active DSH runtime"),
  ];
  for (const step of result.steps ?? []) {
    lines.push("", String(step.order) + ". " + step.action, "   Why: " + step.rationale,
      "   Tool candidates: " + ((step.toolCandidates ?? []).join(", ") || "(none)"),
      "   Stop when: " + step.stopWhen);
  }
  lines.push("", result.caveat ?? "The plan is advisory.");
  return lines.join("\n");
}

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help") || args.includes("-h") || args[0] === "help") {
  if (args.length === 0) {
    process.stderr.write("Missing mode. Run dsh-context-quality --help for usage and examples.\n");
    process.exit(2);
  }
  process.stdout.write(HELP);
  process.exit(0);
}

const mode = args[0];
if (!MODES.includes(mode)) {
  process.stderr.write("Unknown mode: " + mode + "\nSupported modes: " + MODES.join(", ") + "\nRun dsh-context-quality --help for examples.\n");
  process.exit(2);
}
const flags = args.slice(1);
const invalidFlag = flags.find((flag) => flag !== "--text");
const repeatedTextFlag = flags.filter((flag) => flag === "--text").length > 1;
if (invalidFlag || repeatedTextFlag) {
  const problem = invalidFlag ?? "--text (repeated)";
  process.stderr.write("Unsupported or repeated option: " + problem + "\nRun dsh-context-quality --help for valid usage.\n");
  process.exit(2);
}
const textOutput = flags.includes("--text");

let stdin = "";
try {
  for await (const chunk of process.stdin) stdin += chunk;
} catch (error) {
  process.stderr.write("Could not read JSON from stdin: " + error.message + "\n");
  process.exit(2);
}
if (!stdin.trim()) {
  process.stderr.write("No JSON input received on stdin. Pipe one JSON object into the command; see --help for examples.\n");
  process.exit(2);
}

let input;
try {
  input = JSON.parse(stdin);
} catch (error) {
  process.stderr.write("Invalid JSON on stdin: " + error.message + "\nExpected one JSON object. Run dsh-context-quality --help for examples.\n");
  process.exit(2);
}
if (input === null || typeof input !== "object" || Array.isArray(input)) {
  process.stderr.write("Input must be a JSON object, for example {\"source\":\"ERROR: example\"}. Run --help for mode-specific examples.\n");
  process.exit(2);
}

let result;
try {
  if (mode === "compact") result = compactText(input.source, input.options ?? {});
  else if (mode === "quality") result = assessQuality(input);
  else if (mode === "recover") result = recoverContext(input);
  else if (mode === "budget") result = recommendContextBudget(input);
  else if (mode === "plan") result = planContextRetrieval(input);
  else result = adaptiveCompactText(input);

  process.stdout.write(textOutput ? formatText(mode, result) + "\n" : JSON.stringify(result, null, 2) + "\n");
  if (mode === "quality" && result.status === "fail") process.exitCode = 1;
  else if (mode === "quality" && result.status === "insufficient-checks") process.exitCode = 3;
} catch (error) {
  process.stderr.write(error.name + ": " + error.message + "\nTip: verify the JSON fields for this mode with dsh-context-quality --help.\n");
  process.exit(2);
}
