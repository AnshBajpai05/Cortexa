# Cortexa — Roadmap Ledger

Tracks execution of `take_step_forward.md`. Updated every working session.
Status: ✅ done · 🔄 in progress · ⬜ pending · ⛔ blocked-on-user

---

## Tier 1 — Reliability core

| Item | Status | Evidence / Notes |
|---|---|---|
| T1-1 Close self-correction loop | ✅ `ac8f5ff` | retryBackward recreates evaluator+descendants; worker fail-before-retry ordering. **Verified live:** B re-executed attempts 1→3, clean halt at maxRetryAttempts |
| T1-2 Execution generations (`executionId`) | ✅ `ac8f5ff` | Migration `20260606120000`; poll/resolve/complete/retry/propagate scoped |
| T1-3 Idempotent enqueue + concurrency | ✅ `ac8f5ff` | `jobId=runId` on all 3 enqueue sites; `WORKER_CONCURRENCY` (default 4) |
| T1-4 Reconciliation watchdog | ✅ | `reconciler.service.ts`: 60s sweep — running>TTL(15m)→failed via completeRun (propagation+SSE fire); queued>grace(2m) w/ satisfied parents→idempotent re-enqueue. Boot-verified "Armed" |
| T1-5 validateGraph at trigger | ✅ `ac8f5ff` | Cycles/unknown-types/dupes rejected with 400, not silently dropped |
| T1-6 Fail-closed auth minimum | ✅ | Webhook secret fail-closed ✅. `ApiKeyGuard` ✅ — opt-in x-api-key on public endpoints (exempts SSE+internal); enable via CORTEXA_API_KEY. **Key rotation: ⛔ user** |
| T1-7 CI + engine tests | ✅ | `ci.yml`: tsc×3 + **engine regression test (18 assertions)** + frontend tsc+vite + py_compile×12 + secret scan. `pnpm test` runs engine suite. Full-stack e2e proven live this session (A→B→C) |
| T1-8 One live verified run (real keys) | ✅ **LIVE** | Ran research golden suite against live NVIDIA keys (5-account pool). **Scorecard: struct% 100% · content% 82% · avg 60s** (`eval/results/2026-07-01T08-16-57Z.json`). Real grounded content verified end-to-end (prompt→DAG→exec→graded output). Keys rotated ✅ + **multi-account pool** (`NVIDIA_API_KEYS`, round-robin + failover on 429/401/403 in worker `nvidiaPost` + api `nimChat`; boot audit shows "5 account keys"). Remaining: marketing suite (blocked on dead image model), ppt suite |
| T1-8a Model-catalog drift fix (found via live run) | ✅ | Live run exposed dead NIM models: `kimi-k2` (410 EOL 2026-05-12), `llama-3.3-70b` (>300s timeout), `nv-rerankqa`/`flux.1-dev`/`paligemma`/`paddleocr` (gone). Fixed central `models.config.ts`: reasoning/mid/agent/analyst → **`qwen3-next-80b-a3b`** (MoE, live, fast); rerank now **graceful-degrades** to retrieval order; `auditModelConfig` false-MOCK fixed (honors `NVIDIA_API_KEY(S)`). ⬜ Still to fix: image (`flux1-dev` hardcoded in agent-gateway:419), vision, ocr |
| T1-9 Indexes / upload cap / SSRF guard | ✅ | Run indexes ✅. ppt-worker `MAX_PDF_BYTES`=25MB (413, content-length precheck) ✅. doc-ingest SSRF guard ✅ (loopback/private/metadata blocked; test-verified) |

## §4 Hidden weaknesses

| Item | Status | Notes |
|---|---|---|
| §4.2 Retry stacking (BullMQ×engine×HTTP) | ✅ | BullMQ attempts 3→1 (all 3 sites); engine owns retries; reconciler covers crash-requeue |
| §4.3 Parallel-join race | ✅ via T1-3 | jobId dedupe covers double-enqueue path |
| §4.5 Falsy port mapping (`\|\|` chain) | ✅ | `??` chain in resolveInputs |
| §4.5 Run.status 'running'/startedAt never set | ✅ | internal.controller sets running+startedAt on 'started' log (also feeds reconciler TTL + real latency metrics) |
| §4.5 Safety string-parse brittleness | ⬜ | |
| §4.5 FLUX placeholder = silent fake success | ⬜ | Make degraded-mode visible |
| §4.5 confidence = length heuristic | ⬜ | Label honestly in UI |
| §4.6 Eval harness / golden set | ⬜ | = T2-E1 |

## Tier 2

| Item | Status |
|---|---|
| T2-E1 Eval harness (golden set, CI-gated) | ⬜ |
| T2-P1 Provider abstraction + fallback router | ⬜ |
| T2-V1 pgvector migration | ⬜ |
| T2-O1 Observability (pino, correlation ids, Redis SSE bus) | ⬜ |
| T2-A1 Real auth + workspace enforcement | ⬜ |
| T2-D1 Dynamic handoffs / conditional edges | ⬜ (after engine stable) |
| T2-M1 Generic MCP client node | ⬜ |

## Phase 2 — Eval harness (PROOF)

| Item | Status | Notes |
|---|---|---|
| Golden suites (marketing/research/ppt, 10 each = 30) | ✅ | `eval/golden/*.json` — structural + content assertions |
| Runner + scorecard | ✅ | `eval/runner.mjs`: dispatch→poll→terminal-output→assert; per-suite struct%/content%/avg_ms + JSON results |
| **Structural proof (mock, no keys)** | ✅ **VERIFIED** | **30/30 pipelines struct% = 100%** across all 3 types, live this session (marketing 3.9s · ppt 3.8s · research 2.9s avg). Proves prompt→DAG→exec→completion end-to-end |
| Content% (live keys) | ✅ **VERIFIED** | Research suite on live 5-key pool: **struct% 100% · content% 82% · avg 60s** (2026-07-01). Marketing/ppt pending dead image-model fix |
| Retry-recovery numbers | ⬜ | Still to measure on live keys |

## §11 Next-gen (after Tier-1)

⬜ Autopilot package: speak-a-brief · voice narration · autopilot mode · Telegram bot · debate template · scheduled pipelines

## Known issues discovered en route

| Issue | Status |
|---|---|
| Host postgres shadows container on :5432 (container DB empty; real data on host instance) | 📝 documented — decide: change compose port or kill host pg |
| 4× "exhausted max attempts" logs (BullMQ job retries re-fired retry-backward) | 🔄 fixed by attempts 3→1 this session |
| ppt-worker image deps stale after requirements.txt edits | 📝 rule: `docker compose build ppt-worker` after dep changes |
| `scanned:true` false-positive on near-empty PDFs (<100 chars/page) | 📝 cosmetic |

## Blocked on user

1. ~~Rotate NVIDIA keys~~ ✅ done + **pooled across 5 accounts** (load-balanced). ⛔ **Groq + HF keys still live in `apps/api/.env` — kill or rotate.**
2. Decide host-vs-container postgres
