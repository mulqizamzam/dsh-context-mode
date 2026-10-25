#!/usr/bin/env bash
set -euo pipefail
EXPECTED="mulqizamzam/dsh-context-mode"
if ! command -v gh >/dev/null 2>&1; then echo "ERROR: GitHub CLI (gh) is required." >&2; exit 1; fi
AUTH_USER="$(gh api user --jq .login)"
if [[ "$AUTH_USER" != "mulqizamzam" ]]; then echo "ERROR: logged in as $AUTH_USER; expected mulqizamzam" >&2; exit 1; fi
if [[ ! -d .git ]]; then git init -b main; fi
git add .
if ! git diff --cached --quiet; then git commit -m "feat: initial DeepSeek Harness Context Mode port"; fi
if gh repo view "$EXPECTED" >/dev/null 2>&1; then echo "Repository exists; refusing to overwrite." >&2; exit 1; fi
gh repo create "$EXPECTED" --public --source . --remote origin --push
