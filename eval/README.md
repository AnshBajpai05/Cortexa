# Cortexa Evaluation Harness

Turns claims from *"designed for"* into *"verified on"*. Runs golden prompt
suites against a live API, scores them, prints a scorecard, persists JSON.

## Suites (`golden/*.json`)

| Suite | Cases | Proves |
|---|---|---|
| `marketing` | 10 | brief → ad copy (CTA, length) |
| `research` | 10 | prompt → cited summary (citations, length) |
| `ppt` | 10 | brief → deck outline (length, structure) |

Each case has **structural** assertions (pipeline produced output — works in
MOCK mode, no keys) and **content** assertions (quality — needs live NVIDIA keys).

## Run

Requires the stack up (postgres, redis, api, worker) and a seeded
`default-workspace`.

```bash
# Structural proof (no keys — validates the orchestration path end to end)
node eval/runner.mjs

# One suite
node eval/runner.mjs --suite research

# Quality numbers (real) — needs live NVIDIA keys on the worker
API_BASE=http://localhost:3001/api CORTEXA_API_KEY=<key> node eval/runner.mjs
```

## Output

```
━━━━━━ SCORECARD ━━━━━━
suite       cases  struct%  content%  avg_ms
marketing      10     100%      mock     1840
research       10     100%      mock     2110
ppt            10     100%      mock     2360
```

- **struct%** — % of cases where the pipeline built + ran to completion. Real
  proof of the engine even without keys.
- **content%** — quality pass rate. `mock` when no keys; a real percentage with
  live keys. This is the number that fills the README "verified on" table.
- Full per-case detail saved to `eval/results/<timestamp>.json`.

## Interpreting

MOCK run with `struct% = 100` proves: prompt → DAG build → node execution →
completion works end to end for all 30 cases. The remaining proof (content
quality + retry-recovery rate) unlocks the moment real keys are set.
