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

## Hook errors from other hosts

A diagnostic such as `PreToolUse hook — Could not read /home/administrator/.claude/settings.json` with a suggested fix of `context-mode upgrade` belongs to the upstream Claude Code hook diagnostics; it is not evidence that the DSH bundle itself read or changed that file.

- First identify which installation emitted the warning. Updating the DSH plugin does not necessarily update a separately installed Claude Code plugin or global `context-mode` CLI.
- For a standalone Claude Code/context-mode installation, use the upstream `ctx_upgrade` tool or the installed `/context-mode:ctx-upgrade` Skill when available, run its returned upgrade command in that host's terminal, restart Claude Code, then rerun `ctx_doctor`.
- For the DSH bundle, update only the active DSH profile using the command above, restart that profile, and rerun `ctx_doctor`.
- Do not read, overwrite, or change permissions on `~/.claude/settings.json` as part of a DSH update. If the warning persists after the appropriate upgrade, report the exact diagnostic and investigate the file access/configuration in the host that emitted it. Do not claim the issue is fixed until the follow-up diagnostic passes.
