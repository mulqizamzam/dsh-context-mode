#!/usr/bin/env node
import { compactText, assessQuality, recoverContext, recommendContextBudget } from "../lib/context-quality.mjs";

const mode = process.argv[2];
if (!["compact", "quality", "recover"].includes(mode)) {
  process.stderr.write("Usage: node scripts/context-quality.mjs <compact|quality|recover> < request.json\n");
  process.exit(2);
}

let input;
try {
  let stdin = "";
  for await (const chunk of process.stdin) stdin += chunk;
  input = JSON.parse(stdin);
} catch (error) {
  process.stderr.write(`Input must be valid JSON on stdin: ${error.message}\n`);
  process.exit(2);
}

let result;
try {
  if (mode === "compact") result = compactText(input.source, input.options ?? {});
  else if (mode === "quality") result = assessQuality(input);
  else if (mode === "recover") result = recoverContext(input);
  else result = recommendContextBudget(input);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (mode === "quality" && result.status === "fail") process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.name}: ${error.message}\n`);
  process.exit(2);
}
