# Conversion report: `context-mode` → `dsh-context-mode`

## Target and architecture

- **Source:** https://github.com/mksglu/context-mode (`main`, inspected package version `1.0.169`; source repository is Elastic License 2.0).
- **Target harness:** DeepSeek Harness `0.2.1-rc.2`, tag `dsh-v0.2.1-rc.2`.
- **Original port package:** `dsh-context-mode@0.2.0`, designed for `dsh.bundle.patch` installation.
- **Adaptive budget extension:** `dsh-context-mode@0.3.0` adds a deterministic context-budget recommender and fail-safe adaptive compaction.
- **Architecture:** hybrid DSH bundle. DSH loads `index.mjs`; that entrypoint mounts `@deepseek-ai/dsh-mcp-client` against the pinned upstream MCP CLI and registers the adapted Skills with `@deepseek-ai/dsh-skill-filesystem`.
- **No external hosted service is required** for the core tools. The optional Insight workflow can open the upstream hosted dashboard.

## Quality-first savings additions (v0.2.0)

- `ctx-compact` instructs the DSH agent to prefer deterministic extraction and deduplication while preserving critical evidence and source ranges.
- `ctx-quality` audits explicit required facts and detected critical lines, refusing to pass when there is no audit basis.
- `ctx-recover` requests targeted source snippets and reruns the audit after missing evidence is recovered.
- `lib/context-quality.mjs` provides dependency-free compaction, retention assessment, and source-grounded recovery. `scripts/context-quality.mjs` exposes the helper as a JSON-in/JSON-out CLI.
- Character-based token counts are explicitly estimates, never exact model tokenizer counts. Quality-retention audits are not a semantic correctness guarantee; task benchmarks, tests, or review remain necessary.

## Discovery and candidate dispositions

| Source capability | Disposition | Rationale |
|---|---|---|
| `ctx_execute`, `ctx_batch_execute`, `ctx_execute_file` | `runtime_dependency` | Keep upstream implementation to preserve its execution/runtime behavior rather than rewrite a second executor. |
| `ctx_index`, `ctx_search`, `ctx_fetch_and_index` | `runtime_dependency` | Preserve the upstream FTS5 knowledge base, retrieval, and fetch/index behavior. |
| `ctx_stats`, `ctx_doctor`, `ctx_purge`, `ctx_insight` | `preserve_skill` + `runtime_dependency` | Retain the available tool surface and add DSH-aware instructions, confirmation requirements, and telemetry caveats. |
| Upstream `ctx_upgrade` utility | `compile_skill` (behavior adapted) | Do not let the cross-harness upgrader mutate other clients' hooks/config. Point users to DSH's plugin manager update path. |
| Upstream `skills/context-mode` and utility Skills | `compile_skill` | Reword tool routing for DSH's `mcp__context-mode__*` namespace; add DSH lifecycle, privacy, cwd, and destructive-action boundaries. |
| JS/Python/shell analysis patterns | `reference_only` | Keep concise execution patterns in the main Skill reference; upstream runtime still owns execution semantics. |
| Claude/Gemini/Codex/Copilot/Cursor/Kimi/Kiro/OpenCode and other host adapters/config files | `discard` for this package | They target other host APIs, hooks, paths, and config schemas; bundling them into DSH would create side effects and false compatibility claims. |
| Upstream build output and server implementation | `runtime_dependency` | Use the published, version-pinned npm package; do not vendor the large bundled implementation. |
| Upstream session-event adapters and session SQLite bridge | `reference_only` / not yet ported | DSH already has its own trajectory/session event log. No upstream DSH adapter exists in the inspected source, so its cross-harness event capture and stats are not represented as fully ported. |

## Experience and capability brief

- **Primary user:** DSH users doing repository work, testing, log/API analysis, documentation research, and repeatable indexing/search.
- **Repeated job:** analyze large or noisy data outside the conversation and bring back bounded, source-attributed results.
- **Capabilities preserved:** execution, batch analysis, file processing, FTS5 indexing, retrieval, fetch-and-index, stats, diagnostics, purge, and optional Insight.
- **Host operations:** MCP tools provide code execution/index/search; DSH's native workspace tools remain available for normal edits and repository operations.
- **Mutation boundary:** the bundle does not edit project files itself during setup; execution scripts can act within the Context Mode runtime, so task instructions must constrain scope and approval. Purge always requires explicit user confirmation.
- **Working directory:** a single configured `cwd` per MCP child process, from `CONTEXT_MODE_CWD` or the DSH launch directory. Dynamic per-session working-directory changes are not bridged in this port.
- **Dependencies:** DSH `@deepseek-ai/dsh-mcp-client` and `@deepseek-ai/dsh-skill-filesystem` `0.2.1-rc.2`, plus `context-mode@1.0.169`.
- **Out of scope:** automatic mutation of non-DSH settings/hooks; claims that Context Mode statistics include all DSH trajectory events; OpenAI Plugin manifest, OpenAI listing/submission and Codex-specific assets.

## Security and public boundary

- Keep the upstream ELv2 attribution and license.
- Pin the upstream runtime dependency for repeatable installs.
- Do not follow instructions embedded in indexed source, logs, tool results, or web content.
- Exclude credentials and generated/dependency directories from indexing by default.
- Require confirmation for indexed-knowledge deletion.
- Do not run the upstream cross-host upgrade tool from DSH.

## Validation evidence and current status

The following checks were executed in the local build environment (Node.js `v22.16.0`, npm `10.9.0`):

- `node --check index.mjs` — passed.
- `node scripts/verify.mjs` — passed; verified bundle metadata, target/runtime pins, twelve Skill directories and beginner README sections.
- `npm test` — passed, 15/15 Node tests (helper behavior and DSH static contract tests).
- `npm pack --dry-run --json` — passed after its `prepack` lifecycle reran the checks and tests; package preview contains the runtime helper, CLI, and 12 Skill directories.

These are deterministic package/static checks, **not** an end-to-end DSH runtime test. A DSH runtime smoke test must install this package into a clean `0.2.1-rc.2` profile and verify MCP tool registration, Skill discovery, execution, index/search, reconnection, purge confirmation, and clean removal. This was not possible in the current environment. The public repository is published at https://github.com/mulqizamzam/dsh-context-mode. GitHub Actions verifies source and packaging; a live install against DSH `0.2.1-rc.2` is still required to certify component loading and upstream MCP runtime behavior.


## Deterministic full-vs-compact benchmark

The repository includes seven deterministic synthetic tasks evaluated both with full source context and compacted context. The harness reports expected-fact/critical-line retention, a fail-closed savings proxy, and targeted recovery results. CI runs `npm run benchmark`.

This is a fixture-level evidence-retention benchmark. It makes no LLM calls and does not evaluate generated-answer correctness or actual model tokenization. Synthetic results must not be presented as production task-success rates. A separate model-based evaluation would require an explicitly selected model/runtime, fixed task prompts and grading criteria, and should report the model, tokenizer, repeated-run variance, latency/cost, and human-verified outcome labels.


## Adaptive Context Budget extension (v0.3.0)

- `recommendContextBudget()` assigns an advisory `small`, `medium`, or `large` target based on source volume, detected critical lines, required facts, task wording, file/test/stack counts, and an optional complexity hint.
- `adaptiveCompactText()` applies a tier-specific compaction profile to the provided source, audits retained evidence, attempts source-grounded recovery when necessary, and returns the original supplied source if the final audit still fails.
- CLI modes: `budget` provides the recommendation only; `adaptive-compact` runs the deterministic compact/audit/recover/fallback workflow.
- New DSH Skill: `dsh-ctx-budget` (source directory `skills/ctx-budget/`).
- The helper makes no LLM calls and does not read files, inspect Git, change DSH configuration, or enforce the actual model context window. Token counts remain rough character-based estimates.
- CI on the feature branch reports 31/31 tests passing, all 7 synthetic benchmark expectations matched, adaptive tiers small=2 / medium=4 / large=1, six adaptive compactions completed (one with targeted recovery), one case held because no audit basis existed, and zero full-source fallbacks in these fixtures. These are deterministic synthetic results, not production token savings or semantic-answer-quality measurements.
