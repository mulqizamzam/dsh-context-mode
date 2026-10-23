# Conversion report

- **Source:** https://github.com/mksglu/context-mode
- **Target:** https://github.com/mulqizamzam/dsh-context-mode
- **Harness contract:** DeepSeek Harness `dsh-v0.2.1-rc.2`
- **Package version:** `0.1.0`
- **Architecture:** DSH profile bundle + DSH-native MCP client + DSH skill filesystem provider.
- **Core runtime:** upstream npm package `context-mode@1.0.169`, pinned exactly.

## Workflow disposition

| Upstream job | Disposition | Notes |
|---|---|---|
| Sandboxed execution, batch analysis | Preserve via upstream MCP runtime | DSH native MCP bridge exposes original tools. |
| File/documentation indexing and BM25 search | Preserve via upstream MCP runtime | Index before searching; storage follows upstream behavior. |
| Fetch-and-index | Preserve via upstream MCP runtime | Network behavior follows upstream configuration. |
| Statistics and diagnostics | Preserve, DSH wrapper skills | Stats are upstream-owned, not complete DSH event telemetry. |
| Knowledge-base purge | Preserve with explicit intent | Destructive operation is never automatic. |
| Insight | Reference/preserve through upstream | Service/account availability may vary. |
| Cross-harness automatic hooks | Exclude | Claude/Codex/Gemini/Copilot configs target different host contracts. |
| DSH skill routing | Compile/preserve | Eight workflow skills included. |
| Upgrade commands that mutate foreign configs | Restrict | Must not modify unrelated harness configuration. |

## Security and publication boundary

- No credentials are embedded.
- Upstream execution tools can run code/shell; treat input as untrusted and review generated programs when practical.
- Indexing persists; exclude credentials, keys and sensitive personal data.
- Purge is destructive and requires explicit user intent.
- Runtime compatibility is pinned to DSH 0.2.1-rc.2 and Context Mode 1.0.169.
- Full parity for upstream per-tool hooks, cross-client session events and compaction injection is not claimed.

## Validation

Source-level tests and package checks must run in CI. A real DSH profile smoke test is still required before claiming end-to-end runtime compatibility.
