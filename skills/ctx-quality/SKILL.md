---
name: dsh-ctx-quality
description: Audit whether compacted context still preserves task-critical facts, error evidence and source anchors before relying on it.
---

# Quality gate for context savings

Use this workflow after compaction and before making a consequential decision from the shortened output.

1. Build a checklist from the actual task: user constraints, required facts, acceptance criteria, relevant file/function names, error and stack evidence, test outcomes, numeric values and unresolved uncertainty. Do not invent requirements to make the check pass.
2. Compare the compact result with the source or an authoritative indexed/file source. Check each required fact explicitly and check that all distinct critical errors and evidence remain represented.
3. When the package's deterministic helper is accessible, run `node scripts/context-quality.mjs quality` with JSON on stdin containing `source`, `compact`, and `requiredFacts`. Interpret its output as a deterministic retention audit, not a semantic correctness certificate. Its token counts are rough `ceil(characters/4)` estimates.
4. If direct helper execution is not available in the DSH environment, perform a transparent item-by-item evidence checklist. Do not invent a numerical score or imply the helper ran.
5. Reject compaction when a required fact is absent, a material conflict was flattened, a critical error was omitted, or source traceability is lost. Use `ctx-recover` to restore only the necessary source spans, then rerun the audit.
6. A pass means only that the audited facts/evidence were retained. It does not prove that the final answer is correct; validate results with tests, source evidence or human review appropriate to the task.

## Required output

Provide: required facts checked; retained/missing facts; critical evidence retained/missing; known limits; and one status (`pass`, `fail`, or `insufficient checks`). Keep estimated savings separate from task success or semantic quality.