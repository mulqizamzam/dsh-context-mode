/**
 * DSH Context Mode package entry.
 * The profile composition is declared in cordis.patch.yml.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
export const name = "dsh-context-mode";
export const version = packageJson.version;
export const dshTarget = packageJson.engines.dsh;
export const upstream = Object.freeze({ package: "context-mode", version: packageJson.dependencies["context-mode"] });
export default Object.freeze({ name, version, dshTarget, upstream });
