#!/usr/bin/env node
import { formatContextBenchmark, runContextBenchmark } from "../lib/context-benchmark.mjs";

const report = runContextBenchmark();
if (process.argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`${formatContextBenchmark(report)}\n`);
}

if (report.expectationFailures.length > 0) process.exitCode = 1;
