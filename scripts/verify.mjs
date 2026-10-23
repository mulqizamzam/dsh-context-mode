import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const patch = await readFile(resolve(root, "cordis.patch.yml"), "utf8");
const readme = await readFile(resolve(root, "README.md"), "utf8");

assert.equal(pkg.name, "dsh-context-mode");
assert.equal(pkg.version, "0.1.0");
assert.equal(pkg.engines.dsh, "0.2.1-rc.2");
assert.equal(pkg.dependencies["context-mode"], "1.0.169");
assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
assert.match(patch, /@deepseek-ai\/dsh-mcp-client/);
assert.match(patch, /@deepseek-ai\/dsh-skill-filesystem/);
assert.match(patch, /require\.resolve\('context-mode\/cli'\)/);
assert.match(readme, /mulqizamzam\/dsh-context-mode/);

const skillsRoot = resolve(root, "skills");
const skills = (await readdir(skillsRoot, { withFileTypes: true })).filter((e) => e.isDirectory());
assert.equal(skills.length, 9);
for (const entry of skills) {
  const file = resolve(skillsRoot, entry.name, "SKILL.md");
  assert.ok(file.startsWith(skillsRoot + sep));
  const content = await readFile(file, "utf8");
  assert.match(content, /^---\nname: [^\n]+\ndescription: [\s\S]*?\n---\n/);
  assert.ok(content.trim().length > 120, entry.name + " instructions too short");
}
console.log(JSON.stringify({ok:true,package:pkg.name,version:pkg.version,dsh:pkg.engines.dsh,skills:skills.map(s=>s.name)},null,2));
