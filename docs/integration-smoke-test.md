# DSH Runtime Integration Smoke Test

This checklist validates the installed bundle against a real DeepSeek Harness (DSH) runtime. Passing CI, `npm test`, `npm run benchmark`, or `npm pack --dry-run` does **not** count as a runtime integration pass.

Target package: `dsh-context-mode@0.2.0`  
Target DSH: `0.2.1-rc.2`

## Safety notes

- Prefer a disposable DSH profile for this test. Do not overwrite an existing profile to save time.
- The index/search probe below writes a harmless test file and adds its contents to Context Mode's persistent index. Do not include secrets, credentials, personal data, or project files.
- Do **not** call `ctx_purge` as part of this smoke test. It is destructive and is not needed to prove that the core integration works.
- Record each item as **PASS**, **FAIL**, or **NOT RUN**. A command completing is not enough if the expected component/tool is absent.

## 1. Check prerequisites

Run these in Bash:

```bash
node --version
dsh --version
pnpm --version
```

The target DSH release declares Node.js `^22.19.0 || >=24.0.0` in its [tagged package metadata](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.1-rc.2/package.json); this package itself declares `>=22.5.0`. Use the DSH requirement because it is stricter. DSH plugin installation forwards package operations to pnpm, so pnpm must be available.

## 2. Create a disposable profile

Only run this for a **new profile name**. If `ctx-smoke` already exists and contains anything you need, choose another name instead. This command initializes the new profile from the shipped `web` profile and boots it; stop it with Ctrl+C after it starts.

```bash
dsh --profile ctx-smoke --from-default-profile web
```

## 3. Install the bundle and inspect composition

```bash
dsh plugin --profile ctx-smoke add "github:mulqizamzam/dsh-context-mode#main"
dsh plugin --profile ctx-smoke why dsh-context-mode
dsh --profile ctx-smoke --dump-config | grep -nE 'dsh-context-mode|context_mode'
```

**PASS when:** the install exits successfully; the dependency resolves; and the composed config includes both the `dsh-context-mode-mcp` and `dsh-context-mode-skills` rows, with MCP server name `context_mode`.

If the config is missing either row, do not continue to interpret later checks as an end-to-end pass.

## 4. Boot and check startup

```bash
dsh --profile ctx-smoke
```

Inspect the startup output/logs and the DSH UI. Mark **PASS** only if the profile boots and the Context Mode MCP component connects without resolver errors such as `ERR_MODULE_NOT_FOUND`, startup crashes, or unresolved build-script approval issues.

A successful profile boot alone does not prove that every tool or Skill works.

## 5. Probe the MCP runtime

In the DSH session, ask it to run these checks using the named Context Mode tools. Verify the actual tool results in the trace/UI where available, rather than accepting an unverified narrative.

1. **Doctor (read-only):** call `ctx_doctor` if available; report its original statuses, including warnings and optional capabilities.
2. **Execution (no file changes):** call `ctx_execute` with language `javascript` and code `console.log("DSH_CONTEXT_SMOKE_OK")`. Confirm the returned stdout is exactly `DSH_CONTEXT_SMOKE_OK`. Do not create, modify, or delete files during this probe.
3. **Index/search (persistent test data):** first create a harmless temporary fixture in Bash:

   ```bash
   mkdir -p /tmp/dsh-context-smoke
   printf '%s\n' 'DSH_CONTEXT_SMOKE_UNIQUE: amber-kestrel-7391' > /tmp/dsh-context-smoke/probe.txt
   ```

   Then use `ctx_index` to index only `/tmp/dsh-context-smoke` with source label `dsh-context-smoke`. Use `ctx_search` to search for the exact term `amber-kestrel-7391`. **PASS when** the search result points back to the test source and contains the unique marker.

   Indexing persists locally. The temporary file can be removed later, but do not assume that deleting the file also deletes the indexed record. Do not run `ctx_purge` to clean it up unless you have separately confirmed that the target knowledge base is disposable and you explicitly intend to erase it.

If a named tool is not available, record **FAIL** or **NOT RUN** and capture the exact message; do not silently substitute an unrelated tool.

## 6. Exercise the three quality-first Skills

These are DSH Skills/workflows, not three new MCP tools. In the DSH session, provide this sample source:

```text
INFO: service booted
INFO: service booted
ERROR: token expired in src/auth.mjs
Expected status: 401
Actual status: 500
INFO: shutdown complete
```

Ask DSH to:
- invoke the registered Skill `dsh-ctx-compact` to reduce repetition while preserving the error, file path, expected status, and actual status;
- invoke `dsh-ctx-quality` to audit those four required facts against the original source;
- invoke `dsh-ctx-recover` if any required fact is missing, then repeat the quality audit. The registered names use the `dsh-` prefix; the corresponding source directories are `skills/ctx-compact/`, `skills/ctx-quality/`, and `skills/ctx-recover/`.

**PASS when:** the Skills are discoverable/usable, exact evidence is retained or recovered from the supplied source, and the final audit status is reported honestly. A quality-audit pass checks evidence retention only; it does not prove the final diagnosis is correct.

## 7. Restart and verify reconnection

Stop the DSH process with Ctrl+C, then boot the same profile again:

```bash
dsh --profile ctx-smoke
```

Repeat the read-only `ctx_doctor` probe and search for `amber-kestrel-7391`. Record whether MCP reconnects and the indexed test source remains searchable after restart.

## 8. Record results

Copy and fill in this report when reporting the test:

```text
Date/time and timezone:
OS / shell:
Node version:
DSH version:
pnpm version:
Profile:
Install + dependency resolution: PASS / FAIL / NOT RUN
Config includes both bundle rows: PASS / FAIL / NOT RUN
Startup + MCP connection: PASS / FAIL / NOT RUN
ctx_doctor: PASS / FAIL / NOT RUN
ctx_execute: PASS / FAIL / NOT RUN
ctx_index + ctx_search: PASS / FAIL / NOT RUN
dsh-ctx-compact: PASS / FAIL / NOT RUN
dsh-ctx-quality: PASS / FAIL / NOT RUN
dsh-ctx-recover: PASS / FAIL / NOT RUN
Restart + reconnection + search persistence: PASS / FAIL / NOT RUN
Exact errors/log excerpts:
Notes:
```

Remove credentials and private paths from logs before sharing them. Report the overall runtime integration as **PASS** only when the critical startup, MCP, Skill, and restart checks pass. Keep optional or unrun checks visible rather than treating them as passed.

## References

- [DSH CLI help](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cli-help.md)
- [DSH CLI behavior reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)
- [Project conversion report](conversion-report.md)
