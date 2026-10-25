import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const patch = await readFile(resolve(root, "cordis.patch.yml"), "utf8");
const readme = await readFile(resolve(root, "README.md"), "utf8");

assert.equal(pkg.name, "dsh-context-mode");
assert.equal(pkg.version, "0.4.0");
assert.equal(pkg.engines.dsh, "0.2.1-rc.2");
assert.equal(pkg.dependencies["context-mode"], "1.0.169");
assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
assert.equal(pkg.exports["./quality"], "./lib/context-quality.mjs");
assert.equal(pkg.bin["dsh-context-quality"], "./scripts/context-quality.mjs");
assert.equal(pkg.scripts.benchmark, "node scripts/context-benchmark.mjs");
assert.equal(pkg.scripts["benchmark:json"], "node scripts/context-benchmark.mjs --json");
assert.match(patch, /@deepseek-ai\/dsh-mcp-client/);
assert.match(patch, /@deepseek-ai\/dsh-skill-filesystem/);
assert.match(patch, /createRequire\(baseUrl\)\.resolve\('context-mode\/cli'\)/);
assert.doesNotMatch(patch, /\brequire\.resolve\(/);
assert.match(readme, /NPM Registry/i);
assert.match(readme, /GitHub Repository/i);
assert.match(readme, /Local Directory/i);

for (const path of [
  "lib/context-quality.mjs",
  "docs/context-retrieval-planner.md",
  "skills/ctx-plan/SKILL.md",
  "docs/adaptive-context-budget.md",
  "skills/ctx-budget/SKILL.md",
  "lib/context-benchmark.mjs",
  "scripts/context-quality.mjs",
  "scripts/context-benchmark.mjs",
  "benchmarks/tasks.mjs",
  "tests/context-benchmark.test.mjs",
]) await access(resolve(root, path));

const skillsRoot = resolve(root, "skills");
const skills = (await readdir(skillsRoot, { withFileTypes: true })).filter((e) => e.isDirectory());
assert.equal(skills.length, 14);
const requiredSkills = ["context-mode", "ctx-budget", "ctx-compact", "ctx-plan", "ctx-doctor", "ctx-execute", "ctx-index", "ctx-insight", "ctx-purge", "ctx-quality", "ctx-recover", "ctx-search", "ctx-stats", "ctx-upgrade"];
for (const name of requiredSkills) {
  const file = resolve(skillsRoot, name, "SKILL.md");
  assert.ok(file.startsWith(skillsRoot + sep));
  const content = await readFile(file, "utf8");
  assert.match(content, /^---\nname: [^\n]+\ndescription: [\s\S]*?\n---\n/);
  assert.ok(content.trim().length > 120, `${name} instructions too short`);
}
assert.match(readme, /CLI helper/i);
assert.match(readme, /context budgeting/i);
assert.match(readme, /retrieval planning/i);
assert.match(readme, /ctx_doctor/);
console.log(JSON.stringify({
  ok:true,
  package:pkg.name,
  version:pkg.version,
  dsh:pkg.engines.dsh,
  skills:requiredSkills,
  qualityHelpers:["compactText","assessQuality","recoverContext","recommendContextBudget","adaptiveCompactText","planContextRetrieval"],
  benchmark:"deterministic evidence-retention only; no model calls"
},null,2));
