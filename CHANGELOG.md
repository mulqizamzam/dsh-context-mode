# Changelog

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
