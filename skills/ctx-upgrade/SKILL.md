---
name: ctx-upgrade
description: Update or repair the Context Mode bundle installed in DeepSeek Harness without modifying configuration for other AI coding clients.
---

# Update Context Mode in DSH

Do not invoke the upstream `mcp__context-mode__ctx_upgrade` from this DSH integration: that upstream utility manages hooks/configurations for other supported hosts, and there is no DSH-specific adapter in the upstream package.

For the current DSH profile, explain the supported package-manager path and ask the user to run it in their terminal:

```bash
dsh plugin --profile web update dsh-context-mode
```

Replace `web` with the profile actually used. Restart the profile after the update, then run the Context Mode diagnostic workflow. Never edit profile lockfiles or other clients' configuration as a side effect. If the DSH version rejects the update command, use the DSH release's built-in Plugins page to update the bundle and report the exact error.
