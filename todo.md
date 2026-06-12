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
| T1-8 One live verified run (real keys → PPTX) | ⛔ user | Blocked on key rotation |
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

1. **Rotate leaked keys** (NVIDIA ×2, Groq, HF) → unblocks T1-8, report publish
2. Decide host-vs-container postgres
