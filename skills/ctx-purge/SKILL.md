---
name: dsh-ctx-purge
description: Delete indexed Context Mode content only when the user explicitly requests permanent removal of the stored knowledge base.
---

# Context Mode Purge

This workflow is destructive.

1. Require explicit user intent to remove indexed content.
2. Call `ctx_purge` with the upstream-required confirmation.
3. Report the actual scope and result returned by the tool.
4. Never claim files outside the Context Mode store were deleted.
