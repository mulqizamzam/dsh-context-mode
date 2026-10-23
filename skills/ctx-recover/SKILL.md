---
name: dsh-ctx-recover
description: Recover missing task-critical context from the original output, file or indexed corpus when compaction fails a quality check.
---

# Targeted context recovery

Use this workflow whenever `ctx-quality` finds a missing fact, missing critical line, weak source anchor or unresolved ambiguity.

1. List exactly what is missing and why it matters. Do not restore the entire corpus by default.
2. Recover the smallest source span that answers the gap: use a source line range, a focused `ctx_search` query against an existing index, or a targeted `ctx_execute_file` read of the relevant file and surrounding lines.
3. Preserve exact evidence such as file path, line numbers, error text, expected/actual values and test status. If two sources disagree, show both with provenance rather than merging them.
4. Add the recovered evidence to the task context and rerun `ctx-quality`.
5. If the fact cannot be found, state that it is unresolved. Verify the source/version and broaden retrieval once; fall back to the full relevant source only when targeted recovery cannot resolve the gap. Never fabricate an excerpt or claim external retrieval occurred without tool evidence.
6. Once the quality gate passes, continue with the compact result plus the recovered snippets. Keep a record of what was recovered so the same retrieval need not be repeated within the task.

The deterministic helper `node scripts/context-quality.mjs recover` can produce excerpts from a supplied source and required-fact list. It only searches the source passed to it; it does not read local files, access an index or retrieve network content automatically.
