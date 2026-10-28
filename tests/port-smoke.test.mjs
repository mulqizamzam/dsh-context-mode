import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

test("targets the requested DSH prerelease and pins upstream runtime", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.equal(pkg.engines.dsh, "0.2.1-rc.2");
  assert.equal(pkg.dependencies["context-mode"], "1.0.169");
  assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
});

test("mounts the upstream MCP server through DSH's native client", async () => {
  const patch = await readFile(join(root, "cordis.patch.yml"), "utf8");
  assert.match(patch, /@deepseek-ai\/dsh-mcp-client/);
  assert.match(patch, /@deepseek-ai\/dsh-skill-filesystem/);
  assert.match(patch, /createRequire\(baseUrl\)\.resolve\('context-mode\/cli'\)/);
  assert.match(patch, /createRequire\(baseUrl\)\.resolve\('dsh-context-mode\/package\.json'\)/);
  assert.match(patch, /CONTEXT_MODE_CWD/);
  assert.doesNotMatch(patch, /\brequire\.resolve\(/);
  assert.doesNotMatch(patch, /npx\s+-y|curl\s+https?:|eval\(/i);
});

test("includes the DSH workflow Skills, including safe update guidance", async () => {
  const skillsRoot = join(root, "skills");
  const entries = (await readdir(skillsRoot, { withFileTypes: true })).filter((e) => e.isDirectory());
  assert.equal(entries.length, 14);
  const names = new Set(entries.map((e) => e.name));
  for (const name of ["context-mode", "ctx-budget", "ctx-compact", "ctx-plan", "ctx-doctor", "ctx-execute", "ctx-index", "ctx-insight", "ctx-purge", "ctx-quality", "ctx-recover", "ctx-search", "ctx-stats", "ctx-upgrade"]) {
    assert.ok(names.has(name), `missing skill: ${name}`);
    const skill = await readFile(join(skillsRoot, name, "SKILL.md"), "utf8");
    assert.match(skill, /^---\nname: [^\n]+\ndescription: [\s\S]*?\n---\n/);
  }
});

test("purge guidance requires explicit destructive intent", async () => {
  const content = await readFile(join(root, "skills/ctx-purge/SKILL.md"), "utf8");
  assert.match(content, /permanent|delete|destructive/i);
  assert.match(content, /explicit/i);
});

test("README clearly documents the three installation sources", async () => {
  const readme = await readFile(join(root, "README.md"), "utf8");
  assert.match(readme, /## Instalasi/i);
  assert.match(readme, /NPM Registry/i);
  assert.match(readme, /GitHub Repository/i);
  assert.match(readme, /Local Directory/i);
  assert.match(readme, /github:mulqizamzam\/dsh-context-mode#main/);
  assert.match(readme, /dsh plugin --profile web add \./);
  assert.match(readme, /Elastic License 2\.0/);
});

test("upstream license and modification notice are included", async () => {
  const license = await readFile(join(root, "LICENSE"), "utf8");
  const notice = await readFile(join(root, "NOTICE.md"), "utf8");
  assert.match(license, /Elastic License 2\.0/);
  assert.match(notice, /Elastic License 2\.0/);
});

test("quality Skill documents a read-only fallback when helpers or ctx_execute are unavailable", async () => {
  const content = await readFile(join(root, "skills/ctx-quality/SKILL.md"), "utf8");
  assert.match(content, /Fallback when helper scripts or .*ctx_execute.* unavailable/i);
  assert.match(content, /dsh-context-quality quality/);
  assert.match(content, /ctx_execute.*missing or fails/i);
  assert.match(content, /grep -Fq/);
  assert.match(content, /NOT IN SOURCE/);
  assert.match(content, /insufficient checks/);
  assert.match(content, /Do not repeat the same failed invocation in a loop/);
});

test("ctx-index Skill documents array-shaped directory filters with an example", async () => {
  const content = await readFile(join(root, "skills/ctx-index/SKILL.md"), "utf8");
  assert.match(content, /include.*arrays of strings/i);
  assert.match(content, /include:\s*\[[^\]]+\]/s);
  assert.match(content, /exclude:\s*\[/);
  assert.match(content, /directory-only/i);
  assert.match(content, /Do not pass `include: "src\/\*\*\/\*.ts"`/);
});

test("ctx-upgrade Skill separates DSH updates from Claude Code hook diagnostics", async () => {
  const content = await readFile(join(root, "skills/ctx-upgrade/SKILL.md"), "utf8");
  assert.match(content, /PreToolUse hook/i);
  assert.match(content, /standalone Claude Code/i);
  assert.match(content, /update dsh-context-mode/);
  assert.match(content, /Do not read, overwrite, or change permissions/i);
  assert.match(content, /rerun `ctx_doctor`/);
});
