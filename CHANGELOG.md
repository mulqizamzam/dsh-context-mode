# Changelog

## 0.5.0 — Native auto-trigger service

- Add the `dsh-context-mode-auto` cordis entry (`lib/auto-trigger.mjs`, package subpath `./auto-trigger`): runs the upstream context-mode hook scripts — the same Claude-dialect entries the other supported platforms use — on DSH's native lifecycle seams, with no Claude Code hook bridge and no hooks.json config file:
  - `agent/created` → `hooks/sessionstart.mjs` (routing block + resume snapshot injected on startup/resume/clear/compact)
  - `tools/pre-execute` → `hooks/pretooluse.mjs` (big-output tools nudged onto the `ctx_*` tools)
  - `tools/post-execute` → `hooks/posttooluse.mjs` (session event capture)
  - `agent/turn-stopping` → `hooks/stop.mjs` (turn-end capture / forced continuation)
- Fail-open everywhere: hook errors, timeouts, and spawn failures never block, replace, or crash the calling turn; the `agent/created` listener swallows all errors (a throwing listener vetoes agent creation in the host).
- Mount-row config surface: `enabled` kill switch, per-event toggles (`events`), `toolMatcher` regex, `timeoutMs`, `configDir` (CLAUDE_CONFIG_DIR; default `$DSH_HOME/context-mode-hooks`), `contextModeRoot` override.
- Zero runtime dependencies; `@deepseek-ai/dsh-llm`'s `createUserMessage` is used opportunistically when resolvable, with a plain-object fallback.
- PreCompact is out of scope: no DSH bridge seam; the compaction gate is owned by the mulqi-context-compression plugin.
- Add `tests/auto-trigger.test.mjs` (stub hook fixtures; no host, no node_modules required).

## 0.4.1 — audit fixes & configurable runtime

- Fix `adaptiveCompactText()` to return an empty string (not `undefined`) for `held-no-source`.
- Preserve the final sufficiency/stop step in `planContextRetrieval()` when `maxSteps` caps the plan.
- Remove the dangling `icon.svg` reference from package metadata.
- Backfill CHANGELOG entries for 0.3.0 and 0.4.0.
- Derive version assertions from `package.json` in `verify.mjs` and `port-smoke.test.mjs`.
- Allow `CONTEXT_MODE_CWD` to override the MCP working directory; fall back to `process.cwd()`.

## 0.4.0 — retrieval planning

- Add `planContextRetrieval()` helper and CLI mode `plan` with task classification, search terms, ordered actions, tool-availability filtering, index-status awareness, and stop conditions.
- Filter suggested tool candidates to `availableTools` when supplied; mark runtime verification as required otherwise.
- Add the `dsh-ctx-plan` Skill and `docs/context-retrieval-planner.md`.
- Fail-closed guardrail: preserve the final sufficiency/stop step when the step count is capped by `maxSteps`.

## 0.3.0 — adaptive context budget

- Add `recommendContextBudget()` and `adaptiveCompactText()` with tier-based compaction, post-compaction quality audit, targeted source recovery, and full-source fallback.
- Add CLI modes `budget` and `adaptive-compact`.
- Add the `dsh-ctx-budget` Skill and `docs/adaptive-context-budget.md`.
- Fail closed on `insufficient-source`, `insufficient-checks`, and `required-facts-not-in-source`.
- Held/fallback statuses always return the supplied source text (never `undefined`) and are reported explicitly rather than as a quality pass.

## 0.2.0 — quality-first context savings

- Add a deterministic full-context vs compact-context evidence-retention benchmark with positive and negative-control fixtures, quality-gated savings, and recovery assessment.
- Run the benchmark in CI; report character/token estimates separately from semantic answer quality.

- Add `ctx-compact`, `ctx-quality`, and `ctx-recover` Skills.
- Add a dependency-free helper for conservative log compaction, required-fact/critical-line retention audits, and source-grounded excerpt recovery.
- Emit explicit line references and duplicate counts; keep detected critical lines even when the output line cap is reached.
- Label character-based token counts as estimates and fail closed when there is no audit basis.
- Add tests for preservation, missing-fact detection, quality gates, and context recovery.

## 0.1.0 — initial DSH port

- Add a DSH `dsh.bundle.patch` profile bundle for target runtime `0.2.1-rc.2`.
- Mount the pinned upstream `context-mode@1.0.169` MCP server through DSH's native MCP client plugin.
- Register DSH-adapted Skills for execution, indexing, retrieval, diagnostics, statistics, purge, Insight, and update guidance.
- Avoid installing hooks or editing settings for other AI coding clients.
- Document the DSH trajectory/session-log boundary and configured MCP working directory.
