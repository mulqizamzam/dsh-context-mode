---
name: dsh-ctx-quality
description: Audit whether compacted context still preserves task-critical facts, error evidence and source anchors before relying on it.
---

# Quality gate for context savings

Use this workflow after compaction and before making a consequential decision from the shortened output.

1. Build a checklist from the actual task: user constraints, required facts, acceptance criteria, relevant file/function names, error and stack evidence, test outcomes, numeric values and unresolved uncertainty. Do not invent requirements to make the check pass.
2. Compare the compact result with the original source or an authoritative indexed/file source. Check every required fact explicitly, along with all distinct critical errors and evidence.
3. The helper matches required facts and critical evidence using case/whitespace normalization plus whole-token boundaries; a substring inside a larger token (for example, `auth` inside `oauth`) does not count as retained evidence. This is still literal evidence matching, not semantic-equivalence or contradiction detection.
4. Prefer the deterministic helper when it is actually available:
   - From a repository checkout where the script exists, send JSON on stdin to `node scripts/context-quality.mjs quality`.
   - In an installed-package environment, use `dsh-context-quality quality` if that executable is on `PATH`.
   - The JSON input contains `source`, `compact`, and `requiredFacts`. Treat the result as a deterministic retention audit, not a semantic correctness certificate. Token counts are rough `ceil(characters / 4)` estimates.
5. If the helper script cannot be found, do not assume the DSH working directory is the repository root. Check whether `dsh-context-quality` is installed on `PATH`; if neither entry point is available, continue with the manual fallback below. Do not install dependencies or change the environment merely to run this audit.
6. If `ctx_execute` is missing or fails:
   - Record the exact tool error and whether the tool was unavailable, failed to start, or returned an execution error.
   - Do not repeat the same failed invocation in a loop. Retry once only when the error appears transient and a retry is safe; otherwise switch to the manual fallback.
   - A failed `ctx_execute` call is a tooling limitation, not evidence that the compacted text passed or failed the quality audit.
7. Reject compaction when a required fact is absent, a material conflict was flattened, a critical error was omitted, or source traceability is lost. Recover only the necessary source spans, then repeat the audit.

## Fallback when helper scripts or `ctx_execute` are unavailable

Use a read-only, item-by-item comparison. The fallback is intentionally manual: it must not pretend that the deterministic helper ran or produce a synthetic score.

1. Preserve the original source and compact result separately. Do not overwrite either one. If the source is not available, do not reconstruct it from memory; mark the affected checks as unverifiable.
2. List task-critical facts verbatim, including exact error messages, paths/symbols, expected-versus-actual values, test outcomes, user constraints, and any important contradictions.
3. If both versions are in files and Bash is available, use fixed-string checks for each fact. Set the paths to the two existing files and adapt the examples to the actual task:

   ```bash
   SOURCE_FILE="/path/to/original-source.txt"
   COMPACT_FILE="/path/to/compacted-result.txt"
   FACTS=(
     "ERROR: token expired in src/auth.mjs"
     "Expected status: 401"
     "Actual status: 500"
   )

   for fact in "${FACTS[@]}"; do
     if ! grep -Fq -- "$fact" "$SOURCE_FILE"; then
       printf 'NOT IN SOURCE: %s\n' "$fact"
     elif grep -Fq -- "$fact" "$COMPACT_FILE"; then
       printf 'RETAINED: %s\n' "$fact"
     else
       printf 'MISSING: %s\n' "$fact"
     fi
   done
   ```

   This checks literal facts only. Also inspect the original's distinct critical lines and confirm that source locations, ordering, numeric distinctions, and contradictions were not lost. Do not treat a successful grep as proof of semantic correctness.
4. If a fact is missing from the compact result, inspect its surrounding lines in the original source when available (for example, `grep -Fn -C 2 -- "exact fact" "$SOURCE_FILE"`). Restore only the relevant source excerpt, then repeat the checklist against the updated result. If the original source or required evidence cannot be accessed, stop and report that limitation.
5. If the source and compact result exist only in the conversation rather than files, compare them directly using the same checklist. Do not create files just to force this fallback to run.

## Required output

Provide: required facts checked; retained, missing, and unverifiable facts; critical evidence retained/missing; whether the helper or `ctx_execute` was unavailable; any recovery performed; and known limits. Return exactly one status: `pass`, `fail`, or `insufficient checks`.

- `pass`: all task-critical facts and distinct critical evidence checked against an available source are retained.
- `fail`: at least one required fact or material evidence item is missing or distorted.
- `insufficient checks`: the source, compact result, or evidence needed to make the comparison is unavailable.

A pass means only that the audited facts/evidence were retained. It does not prove that the final answer is correct. Validate the task result with tests, source evidence, or human review appropriate to the task. Keep estimated savings separate from task success or semantic quality.
