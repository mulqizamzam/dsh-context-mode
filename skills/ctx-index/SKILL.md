---
name: dsh-ctx-index
description: Index an explicitly selected local file tree or documentation source into Context Mode's persistent search store for focused retrieval later.
---

# Context Mode Index

1. Confirm that the target path or source is clear.
2. Exclude secrets, dependencies, build output, caches and generated artifacts.
3. Use `ctx_index` with a path and stable source label; begin with conservative depth/file bounds.
4. For directory indexing, `include`, `exclude`, and `extensions` are arrays of strings—not a single string. `include` and `exclude` are directory-only glob filters. Use this shape:

   ```javascript
   ctx_index({
     path: ".",
     source: "project:<name>",
     include: ["src/**/*.ts", "src/**/*.tsx", "docs/**/*.md"],
     exclude: ["**/*.generated.*", "**/fixtures/**"],
     maxDepth: 5,
     maxFiles: 200
   })
   ```

   Do not pass `include: "src/**/*.ts"`; that fails schema validation because `include` expects an array. Omit directory-only filters when indexing one file.
5. Report indexed file/section counts only when returned by the tool.
6. Ask before increasing the cap above 500 files.
7. Explain that indexing persists locally.
