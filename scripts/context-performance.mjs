#!/usr/bin/env node
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { compactText, assessQuality } from "../lib/context-quality.mjs";

const SIZES = [1_000, 5_000, 15_000];
const REPEATS = 5;

function makeSource(lineCount) {
  const lines = new Array(lineCount);
  for (let index = 0; index < lineCount; index += 1) {
    if (index % 503 === 0) {
      lines[index] = `ERROR: worker timeout ${index} at src/worker.mjs:${index + 1}`;
    } else if (index % 2 === 0) {
      lines[index] = `INFO: worker tick ${index}`;
    } else {
      lines[index] = `INFO: worker task ${index} completed`;
    }
  }
  return lines.join("\n");
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function measure(operation) {
  operation();
  const samplesMs = [];
  let value;
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    const start = performance.now();
    value = operation();
    samplesMs.push(performance.now() - start);
  }
  return {
    value,
    medianMs: Math.round(median(samplesMs) * 1000) / 1000,
    samplesMs: samplesMs.map(value => Math.round(value * 1000) / 1000),
  };
}

const results = [];
for (const lineCount of SIZES) {
  const source = makeSource(lineCount);
  const requiredFacts = [
    "ERROR: worker timeout 0 at src/worker.mjs:1",
    "ERROR: worker timeout 503 at src/worker.mjs:504",
  ];
  const compactRun = measure(() => compactText(source, { maxLines: 128, headLines: 12, tailLines: 12 }));
  const compacted = compactRun.value;
  const qualityRun = measure(() => assessQuality({ source, compact: compacted.text, requiredFacts }));
  assert.equal(compacted.stats.sourceLines, lineCount);
  assert.ok(compacted.text.includes(requiredFacts[0]));
  assert.ok(compacted.text.includes(requiredFacts[1]));
  assert.equal(qualityRun.value.status, "pass");
  results.push({
    inputLines: lineCount,
    sourceCharacters: source.length,
    compactCharacters: compacted.text.length,
    compactMedianMs: compactRun.medianMs,
    compactSamplesMs: compactRun.samplesMs,
    compactMsPerThousandLines: Math.round((compactRun.medianMs / lineCount) * 1_000_000) / 1000,
    qualityAuditMedianMs: qualityRun.medianMs,
    qualityAuditSamplesMs: qualityRun.samplesMs,
    qualityAuditStatus: qualityRun.value.status,
    estimatedCharacterReductionPercent: source.length ? Math.round((1 - compacted.text.length / source.length) * 10_000) / 100 : 0,
  });
}

for (let index = 1; index < results.length; index += 1) {
  results[index].inputScaleFromPrevious = results[index].inputLines / results[index - 1].inputLines;
  results[index].compactTimeScaleFromPrevious = results[index - 1].compactMedianMs === 0
    ? null
    : Math.round((results[index].compactMedianMs / results[index - 1].compactMedianMs) * 100) / 100;
}

const report = {
  benchmark: "dsh-context-mode performance smoke benchmark",
  benchmarkVersion: "1.0.0",
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  repeats: REPEATS,
  scope: "Synthetic local CPU timing for deterministic compaction and literal quality auditing; no model calls or I/O.",
  caveats: [
    "Compare runs on the same hardware and Node version; absolute timings vary by environment.",
    "This benchmark is diagnostic and does not enforce a hard timing threshold.",
    "Character reduction and token figures are estimates, not actual model token usage or semantic quality.",
  ],
  results,
};

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} else {
  process.stdout.write("dsh-context-mode — Performance smoke benchmark\n");
  process.stdout.write(`Node: ${report.node} | platform: ${report.platform}/${report.architecture} | median of ${REPEATS} samples\n\n`);
  for (const item of results) {
    process.stdout.write(
      `${item.inputLines.toLocaleString()} lines: compact ${item.compactMedianMs} ms (${item.compactMsPerThousandLines} ms/1k lines), ` +
      `quality audit ${item.qualityAuditMedianMs} ms, output reduction ≈${item.estimatedCharacterReductionPercent}%, audit=${item.qualityAuditStatus}\n`
    );
    if (item.inputScaleFromPrevious) {
      process.stdout.write(`  scaling: input ×${item.inputScaleFromPrevious}, compaction time ×${item.compactTimeScaleFromPrevious ?? "n/a"}\n`);
    }
  }
  process.stdout.write("\nDiagnostic only: compare runs on the same environment; no absolute latency guarantee.\n");
}
