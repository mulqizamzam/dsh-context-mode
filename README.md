# dsh-context-mode

**Context Mode for DeepSeek Harness (DSH) — beginner guide.**

Independent integration for upstream [mksglu/context-mode](https://github.com/mksglu/context-mode), targeting DSH `0.2.1-rc.2`. It exposes sandboxed execution, batch analysis, persistent indexing/search and diagnostics through DSH's native MCP client.

> This is not an official DeepSeek project. DSH is a developer preview, and full runtime compatibility still needs testing on a real `0.2.1-rc.2` installation.

## For beginners

### Requirements

- DeepSeek Harness `0.2.1-rc.2`
- Node.js 22.5 or newer
- pnpm available to DSH
- A working local profile

### Install

In a terminal, run:

```bash
dsh plugin --profile web add github:mulqizamzam/dsh-context-mode
dsh --profile web
```

Replace `web` with the profile you use. The initial install may request permission to run dependency build scripts. Review those prompts and do not approve unrelated dependencies blindly.

To remove it:

```bash
dsh plugin --profile web remove dsh-context-mode
```

### Try it

Ask DSH to:

- “Analyze this large test log and show only actionable errors.”
- “Index the docs directory for future search.”
- “Search the index for authentication middleware and token refresh.”
- “Show Context Mode statistics.”
- “Run Context Mode diagnostics and explain warnings.”

### What is preserved?

The original Context Mode MCP runtime remains upstream-owned, keeping sandbox execution, batch execution, file analysis, FTS5 indexing/search, fetch-and-index, stats, doctor, purge and Insight. DSH-specific skills guide how to call those tools.

### Troubleshooting

- **No Context Mode tools:** inspect the DSH startup log for MCP connection errors and confirm the profile is using the expected DSH version.
- **Search returns no results:** index the relevant path/source before searching.
- **Dependency install failure:** check Node/pnpm versions and review the package manager's build-script policy.
- **Need to purge the index:** only use the purge workflow when permanent deletion is intended.

## Security

Code/shell execution is powerful. Review generated code when practical, treat input as untrusted, and do not index secrets, credentials, private keys, tokens, or sensitive personal information. Indexing persists locally. Purge is destructive and requires explicit user intent.

## Provenance and license

- Upstream: [mksglu/context-mode](https://github.com/mksglu/context-mode)
- Target harness: [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)
- License: [Elastic License 2.0](LICENSE)
- Conversion report: [docs/conversion-report.md](docs/conversion-report.md)

Upstream copyright and license terms are retained in `LICENSE` and `NOTICE.md`. This port is modified and independently maintained.
