# AGENTS.md — dsh-context-mode

Guidance for coding agents working in this repo. Keep this file current; it is
the single agent-instruction carrier for the project.

## Project purpose

`dsh-context-mode` is a **DeepSeek Harness (DSH) plugin** that ports and adapts
the upstream [Context Mode](https://github.com/mksglu/context-mode) runtime for
DSH `0.2.1-rc.2`. It provides context retrieval planning, adaptive context
budgeting, and quality-first context engineering. It ships three bundle entries
loaded through `index.mjs`:

- **MCP tools** — index / search / execute / stats, via
  `@deepseek-ai/dsh-mcp-client` mounted against the pinned
  `context-mode@1.0.169` CLI.
- **Skills tree** (`skills/`) — diagnosis, index/search, compaction, context
  budget, retrieval planning, quality audit, recovery, and upgrade.
- **Native auto-trigger service** (`lib/auto-trigger.mjs`) — runs upstream
  context-mode lifecycle hooks on DSH seams (`agent/created`,
  `tools/pre-execute`, `tools/post-execute`, `agent/turn-stopping`), fail-open,
  zero runtime dependencies.

ESM (`"type": "module"`). Node `>=22.19.0` (or `>=24`). **No build artifact is
shipped — the `.mjs` source is the package surface.**

## Commands

There is **no compile step**; source is the shipped surface. Use these npm
scripts (defined in `package.json`):

| Purpose | Command | What it runs |
|---|---|---|
| Validate / "build" | `npm run check` | `node --check index.mjs && node scripts/verify.mjs` |
| Test | `npm test` | `node --test tests/*.test.mjs` |
| Full gate | `npm run prepack` | check + test (auto-runs before `npm pack`) |
| Retention benchmark | `npm run benchmark` | deterministic fixtures, **no LLM calls** |
| Performance benchmark | `npm run benchmark:performance` | median + scaling on 1k/5k/15k synthetic lines |
| Packaging preview | `npm pack --dry-run` | runs `prepack`, lists package contents |

CI (`.github/workflows/ci.yml`, on push/PR) runs, in order:
`node --check index.mjs` → `npm test` → `npm run benchmark` →
`npm run benchmark:performance` → `npm pack --dry-run` (Node 22, ubuntu-latest).

## Debug / run

- **CLI helper:** `node scripts/context-quality.mjs <mode> [--text] < input.json`
  (installed bin: `dsh-context-quality`; `--help` lists modes with no file needed).
  It reads **one JSON object on stdin** and emits JSON by default. Modes:
  `compact | quality | recover | budget | adaptive-compact | plan`.
  - `quality` exit codes: `0` pass, `1` fail (required facts / critical evidence
    missing), `2` usage/JSON/input error, `3` insufficient checks.
  - `adaptive-compact` can return a safe **hold/fallback** result with the
    original source unchanged **on exit 0** — inspect the returned `status`
    field, not just the exit code.
- **Single test file:** `node --test tests/context-quality.test.mjs`.
- **DSH runtime smoke test:** install into a clean `0.2.1-rc.2` profile
  (`pnpm install` first, so `context-mode` + `@deepseek-ai/*` peers resolve),
  then `dsh plugin --profile <p> why dsh-context-mode`,
  `dsh --profile <p> --dump-config`, and run `ctx_doctor` in-session.
  See `docs/integration-smoke-test.md`.
- Benchmarks are fixture-level evidence-retention checks; **do not report
  synthetic results as production task-success or token-savings.**

## Vendor / dependency boundaries

- `node_modules/`, `dist/`, `coverage/` are gitignored — **never commit them.**
- Upstream Context Mode is a **pinned runtime dependency**
  (`context-mode@1.0.169`), **not vendored source**. Do not copy the upstream
  bundled build/server into this repo (disposition `runtime_dependency`,
  see `docs/conversion-report.md`).
- DSH host packages are pinned: `@deepseek-ai/*` `0.2.1-rc.2` (peers + dev).
- The `skills/` tree is the adapted, published skill set; upstream host-adapter
  files (Claude/Gemini/Codex/…) are intentionally **discarded** for DSH.
- `lib/context-quality.mjs` is dependency-free by design — keep it that way.

## Commit conventions

Conventional Commits, imperative lowercase subject, optional `#issue`/`#pr`:

```
feat(scope?): <change>
fix: <change>
docs: <change>
chore(release): vX.Y.Z
```

Keep `CHANGELOG.md` in sync for user-facing changes.

## Hot-path file: `lib/context-quality.mjs`

Load-bearing module, exported as the package subpath `./quality` and wrapped by
`scripts/context-quality.mjs`. Invariants to preserve when editing:

- **Dependency-free** — no LLM calls, no file/Git reads, no DSH config writes.
- **Token counts are estimates** (`chars / 4`, see `estimateTokens`), never real
  tokenizer counts — state that in anything it feeds.
- **Evidence matching is word-boundary, not substring**
  (`containsNormalizedEvidence` + `codePointBefore`): facts like `"auth"` /
  `"401"` must **not** match `"oauth"` / `"4010"`. Do not relax to plain
  `.includes()`.
- **Quality audit is fail-closed** — it refuses to pass without an audit basis
  (insufficient evidence ⇒ `3`), and a `pass` only means the checked literal
  facts survived, not semantic correctness.
- **Adaptive compaction is fail-safe** — when the final audit still fails it
  returns the original source unchanged (hold/fallback), never a truncated one.

Exported API: `estimateTokens`, `compactText`, `recommendContextBudget`,
`adaptiveCompactText`, `assessQuality`, `recoverContext`,
`planContextRetrieval`. Regression suites: `tests/context-quality.test.mjs`
and `tests/auto-trigger.test.mjs`.
