import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
test("targets requested DSH prerelease", async () => {
 const pkg = JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 assert.equal(pkg.engines.dsh,"0.2.1-rc.2");
});
test("uses native DSH bundle declaration", async () => {
 const pkg=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 assert.equal(pkg.dsh.bundle.patch,"./cordis.patch.yml");
});
test("registers MCP runtime and skill filesystem without foreign adapters", async () => {
 const patch=await readFile(join(root,"cordis.patch.yml"),"utf8");
 assert.match(patch,/@deepseek-ai\/dsh-mcp-client/);
 assert.match(patch,/@deepseek-ai\/dsh-skill-filesystem/);
 assert.doesNotMatch(patch,/claude-code|gemini-cli|vscode-copilot/i);
});
test("pins upstream Context Mode runtime", async () => {
 const pkg=JSON.parse(await readFile(join(root,"package.json"),"utf8"));
 assert.equal(pkg.dependencies["context-mode"],"1.0.169");
});
test("purge instructions require explicit destructive intent", async () => {
 const content=await readFile(join(root,"skills/ctx-purge/SKILL.md"),"utf8");
 assert.match(content,/permanent|delete|destructive/i);
 assert.match(content,/explicit/i);
});
test("includes beginner docs and upstream license notice", async () => {
 const readme=await readFile(join(root,"README.md"),"utf8");
 const notice=await readFile(join(root,"NOTICE.md"),"utf8");
 assert.match(readme,/For beginners/i);
 assert.match(readme,/Security and privacy/i);
 assert.match(notice,/Elastic License 2.0/);
});
