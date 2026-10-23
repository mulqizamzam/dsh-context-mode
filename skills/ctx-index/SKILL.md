---
name: dsh-ctx-index
description: Index an explicitly selected local file tree or documentation source into Context Mode's persistent search store for focused retrieval later.
---

# Context Mode Index

1. Confirm that the target path or source is clear.
2. Exclude secrets, dependencies, build output, caches and generated artifacts.
3. Use `ctx_index` with a path and stable source label; begin with conservative depth/file bounds.
4. Report indexed file/section counts only when returned by the tool.
5. Ask before increasing the cap above 500 files.
6. Explain that indexing persists locally.
