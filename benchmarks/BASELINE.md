# Baseline benchmark: v1.0.0

**Date:** 2026-10-23  
**Repository commit:** `b651e1a0e8b5846bd0f50f1f1b22a7878e7aef1a`  
**CI run:** [GitHub Actions #39987457412](https://github.com/mulqizamzam/dsh-context-mode/actions/runs/39987457412)

## Summary

| Metric | Result |
|---|---:|
| Deterministic fixtures | 7 |
| Expected statuses matched | 7/7 |
| Full-context retention audit passed | 6/7 |
| Compact-context audit passed | 5/7 |
| Compact-context audit failed | 1 |
| Compact-context audit insufficient | 1 |
| Mean raw character reduction (estimated) | 51.23% |
| Mean quality-adjusted savings credited | 30.02% |
| Failed cases recovered to a passing evidence audit | 1/1 |

## Per-fixture results

| Fixture | Compact audit | Raw character reduction estimate | Savings credited after quality gate | Recovery audit |
|---|---|---:|---:|---|
| `build-install-failure` | pass | 56.41% | 56.41% | pass |
| `unit-test-regression` | pass | 31.54% | 31.54% | pass |
| `api-error-triage` | pass | 57.27% | 57.27% | pass |
| `migration-drift` | pass | 28.29% | 28.29% | pass |
| `security-warning` | pass | 36.61% | 36.61% | pass |
| `middle-line-fact-loss` | **fail** — region fact omitted | 74.62% | **0%** | pass after targeted recovery |
| `no-audit-basis` | insufficient checks | 73.85% | **0%** | insufficient checks |

## Interpretation

The run demonstrates the intended guardrail: compression can appear large while losing a task-relevant fact; that case receives zero quality-adjusted savings, then a source-grounded recovery excerpt restores the required fact and passes the retention audit. When there are no required facts or detectable critical lines, the benchmark refuses to call the compact output a quality pass.

These are **synthetic evidence-retention fixture results**, not production measurements. The estimated token figures use a character-based heuristic, not the model's tokenizer. The runner makes no LLM calls and does not grade generated answers, code correctness, user-task success, latency, or financial cost. Do not interpret 30.02% as measured real-world token savings or as proof of unchanged answer quality.

Re-run after benchmark/compactor changes with `npm run benchmark`; JSON output is available through `npm run benchmark:json`. Treat changed results as a new baseline only after reviewing unexpected outcomes and fixture coverage.
