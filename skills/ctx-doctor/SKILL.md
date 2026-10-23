---
name: dsh-ctx-doctor
description: Diagnose Context Mode runtime availability and report upstream health checks.
---

# Context Mode Doctor

1. Call `ctx_doctor` when available; preserve its original statuses.
2. If MCP is disconnected, inspect DSH package/startup logs instead.
3. Separate failures, warnings and optional capabilities.
4. Never rewrite unrelated harness config to diagnose this bundle.
