# Changelog

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
