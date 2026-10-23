# Adaptive Context Budget (MVP)

The `dsh-ctx-budget` Skill and `recommendContextBudget()` helper select an advisory context budget from explicit task and evidence signals.

## Use it

From a repository checkout, send JSON to the CLI:

```bash
printf '%s' '{"task":"Investigate the root cause of a cross-file regression","source":"ERROR: permission denied at src/app.mjs","requiredFacts":["permission denied","src/app.mjs"],"changedFiles":4,"failedTests":2,"stackFrames":5}' | node scripts/context-quality.mjs budget
```

When the package binary is available on PATH, use `dsh-context-quality budget` with the same JSON input.

Supported inputs:
- `task`, `source`: strings. The helper does not fetch or read source files.
- `requiredFacts`: explicit facts that the source must contain.
- `changedFiles`, `failedTests`, `stackFrames`: non-negative integer counts gathered from actual evidence; leave them at zero when unknown.
- `complexityHint`: optional `auto`, `low`, `medium`, or `high` hint.

## Budget tiers and score

| Tier | Target budget | Score |
|---|---:|---:|
| small | 2,048 estimated tokens | 0–1 |
| medium | 6,144 estimated tokens | 2–4 |
| large | 12,288 estimated tokens | 5+ |

The deterministic score adds weighted signals for:
- estimated source volume: 1 point at 1,000 tokens, 2 at 3,000, 3 at 8,000;
- unique critical lines: 1 point at 2 lines, 2 at 6, 3 at 12;
- required facts: 1 point at 3, 2 at 8;
- multi-file scope: 1 point at 3 changed files, 2 at 8;
- failing tests: 1 point at 2, 2 at 5;
- stack trace: 1 point at 4 frames, 2 at 12;
- task specification length and recognized task language such as root-cause investigation, cross-file/integration work, high-risk changes, and verification-heavy work;
- optional complexity hint: low subtracts 2 points, medium adds 2, high adds 6. Strong evidence can outweigh a low hint.

Each matching signal is returned in `evidenceSignals` so the recommendation can be inspected rather than treated as a black box. These initial weights are an MVP policy, not learned or model-calibrated thresholds.

## Fail-closed audit readiness

The recommendation returns `qualityGateStatus`:
- `insufficient-source`: there is no source text to check.
- `insufficient-checks`: neither required facts nor recognized critical source lines provide an audit basis.
- `required-facts-not-in-source`: one or more declared required facts cannot be found in the supplied source.
- `ready-for-audit`: source and audit basis are present; compaction can proceed to a *post-compaction* quality audit.

`compactionCanProceedToAudit: true` does **not** mean the compacted result has passed. It only means the inputs are ready for a compaction attempt followed by a real `dsh-ctx-quality` check. Recover omitted facts with `dsh-ctx-recover` and rerun the audit.

## Limitations

- Target budgets are advisory recommendations. This MVP does not change DSH settings, model context windows, runtime configuration, or tool behavior automatically.
- Token estimates use `ceil(characters / 4)`, not the model tokenizer.
- It makes no LLM calls, reads no files, inspects no Git state, and performs no compaction itself.
- The tier policy should be tuned only after observing representative tasks and evaluating both evidence retention and task success; a synthetic benchmark alone cannot establish answer quality.
