---
name: dsh-context-mode
description: Use Context Mode tools when processing large command output, logs, source trees, test results, API responses, browser snapshots or documentation; prefer sandboxed processing and focused search over loading bulk data into conversation context.
---

# Context Mode on DeepSeek Harness

## Default approach

When tool output may be large, do not dump it unfiltered into the conversation. Prefer Context Mode MCP tools to execute a small analysis program and return only actionable findings. Batch related operations. Let the model interpret the evidence and code perform deterministic counting, filtering and parsing.

## Workflow

1. Classify the input: code, logs, structured data, documentation or a tool result.
2. Prefer `ctx_execute` or `ctx_batch_execute` for sandbox analysis.
3. For repeated lookups, index the corpus with `ctx_index` first, then retrieve focused passages with `ctx_search`.
4. Use `ctx_fetch_and_index` for public documentation when useful.
5. Use `ctx_stats` to inspect upstream context-saving measurements.
6. Use `ctx_doctor` for upstream diagnostics.
7. Treat `ctx_purge` as destructive and call it only after an explicit deletion request.
8. Use `ctx_upgrade` only for upstream maintenance; never change another harness config on the user's behalf.

## Safety

- Review generated code before executing when possible.
- Never index secrets, credentials, private keys, tokens or sensitive personal data.
- Exclude dependency directories, generated outputs, caches and build artifacts.
- Start broad indexing with conservative bounds.
- Never claim an operation ran without tool evidence.
- Preserve the user's preferred final answer format; Context Mode is not a prose-style enforcement tool.

See [patterns](references/patterns.md) for examples.
