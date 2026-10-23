import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const patch = await readFile(resolve(root, "cordis.patch.yml"), "utf8");
const readme = await readFile(resolve(root, "README.md"), "utf8");

assert.equal(pkg.name, "dsh-context-mode");
assert.equal(pkg.version, "0.2.0");
assert.equal(pkg.engines.dsh, "0.2.1-rc.2");
assert.equal(pkg.dependencies["context-mode"], "1.0.169");
assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
assert.equal(pkg.exports["./quality"], "./lib/context-quality.mjs");
assert.equal(pkg.bin["dsh-context-quality"], "./scripts/context-quality.mjs");
assert.match(patch, /@deepseek-ai\/dsh-mcp-client/);
assert.match(patch, /@deepseek-ai\/dsh-skill-filesystem/);
assert.match(patch, /createRequire\(baseUrl\)\.resolve\('context-mode\/cli'\)/);
assert.doesNotMatch(patch, /\brequire\.resolve\(/);
assert.match(readme, /Quality-First Context Engineering/i);

await access(resolve(root, "lib/context-quality.mjs"));
await access(resolve(root, "scripts/context-quality.mjs"));
const skillsRoot = resolve(root, "skills");
const skills = (await readdir(skillsRoot, { withFileTypes: true })).filter((e) => e.isDirectory());
assert.equal(skills.length, 12);
const requiredSkills = ["context-mode", "ctx-compact", "ctx-doctor", "ctx-execute", "ctx-index", "ctx-insight", "ctx-purge", "ctx-quality", "ctx-recover", "ctx-search", "ctx-stats", "ctx-upgrade"];
for (const name of requiredSkills) {
  const file = resolve(skillsRoot, name, "SKILL.md");
  assert.ok(file.startsWith(skillsRoot + sep));
  const content = await readFile(file, "utf8");
  assert.match(content, /^---\nname: [^\n]+\ndescription: [\s\S]*?\n---\n/);
  assert.ok(content.trim().length > 120, `${name} instructions too short`);
}
assert.match(readme, /ctx-compact/);
assert.match(readme, /ctx-quality/);
assert.match(readme, /ctx-recover/);
console.log(JSON.stringify({ok:true,package:pkg.name,version:pkg.version,dsh:pkg.engines.dsh,skills:requiredSkills,helpers:["compactText","assessQuality","recoverContext"]},null,2));
