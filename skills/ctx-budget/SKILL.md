---
name: dsh-ctx-budget
description: Recommend an adaptive context budget from explicit task complexity and source evidence, with fail-closed quality-audit guardrails.
---

# Adaptive context budget

Use this workflow before reducing a large source, log, tool result, API response, or multi-file investigation.

1. Identify the active task and its required outcomes. Gather only signals available from the current task/source: source size, required facts, detected critical lines, changed-file count, failing-test count, stack-frame count, and any explicit complexity hint. Do not invent counts or inspect files merely to fill metadata.
2. When available, use `node scripts/context-quality.mjs adaptive-compact` with JSON on stdin to run the recommendation, tier-based compaction, quality audit, targeted recovery, and full-source fallback as one deterministic workflow. Use `node scripts/context-quality.mjs budget` when you only need a recommendation. Accepted inputs are `task`, `source`, `requiredFacts`, `changedFiles`, `failedTests`, `stackFrames`, and optional `complexityHint` (`auto`, `low`, `medium`, or `high`). For installed-package environments, use `dsh-context-quality adaptive-compact` or `dsh-context-quality budget` if the binary is on PATH.
3. Interpret the returned tier as an advisory target: `small` = 2,048 estimated tokens, `medium` = 6,144, `large` = 12,288. These are policy targets, not enforced limits and not a change to the model's context window.
4. Prefer the smallest strategy consistent with the task, but never let source size alone justify dropping evidence. Preserve task constraints, errors, source locations, expected/actual values, failing tests, security-sensitive distinctions, and unresolved questions.
5. If `qualityGateStatus` is not `ready-for-audit`, do not claim quality-safe context savings. Obtain the source or resolve missing required facts first. If the status is `insufficient-checks`, specify task-critical facts or preserve the relevant source until a real audit basis exists.
6. The `adaptive-compact` helper runs the deterministic retention audit and targeted recovery on the supplied source. Inspect its `status` and `finalQualityAudit`; if status is `fallback-full-source`, it intentionally returns the original source rather than a lossy compact result. The DSH Skill must still explain the evidence retained/missing and use `dsh-ctx-quality` / `dsh-ctx-recover` when a separate workflow or additional context is needed.
7. Report the chosen tier, target budget, the evidence signals that affected the recommendation, the quality-gate readiness status, and the heuristic caveats. Never present character-based token estimates as exact model-token counts.

## Guardrails

- The budget recommendation is deterministic and does not call an LLM, read local files, or inspect Git. The `adaptive-compact` mode compacts only the source text supplied in its JSON input; it performs no file or network retrieval.
- A recommendation of `large` is not a failure: it may be the correct choice for broad or high-risk work.
- Explicit low-complexity hints may lower the score but do not override strong complexity/evidence signals.
- A `ready-for-audit` status only means the supplied source offers an audit basis; it does not mean compaction has passed. Audit the actual compacted output before relying on it.
