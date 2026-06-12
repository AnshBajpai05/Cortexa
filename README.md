# Cortexa

[![CI](https://github.com/AnshBajpai05/Cortexa/actions/workflows/ci.yml/badge.svg?branch=v1)](https://github.com/AnshBajpai05/Cortexa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

> Build client-ready AI deliverables on a visual canvas — self-hosted, free-tier, NVIDIA-NIM-powered.

A **local-first, DAG-based agentic orchestration platform** for AI teams, enabling **reproducible multi-agent pipelines that produce client-ready deliverables** (reports, slide decks, graphics) through a **visual node canvas + a self-correcting execution engine**.

Unlike traditional approaches, this system:
- Runs entirely on the **NVIDIA NIM free tier** (OpenAI-compatible) — no paid OpenAI AgentKit needed
- Ships a **self-correction loop** — QA failures generate *guided* feedback and retry, not dumb re-runs
- Treats deliverables as first-class: paste a brief/PDF/URL → grounded analysis → **polished PPTX**

---

## 🧭 TL;DR

- **Problem:** Building AI deliverables means bouncing between disconnected tools with no reproducibility, grounding, or quality gates.
- **Solution:** One visual canvas where typed agent-nodes chain reasoning → RAG → safety → generation → export.
- **Core Innovation:** A self-correcting DAG engine with adaptive model routing on free NVIDIA NIM.
- **Impact:**
  - 23 typed node types across generation, logic, RAG, safety, tools, evals
  - ~90% of *free-tier-achievable* orchestration capabilities vs OpenAI DevDay AgentKit
  - PDF/URL/brief → cited analysis → client-ready slide deck, one pipeline

---

## 🎯 Problem Statement

Existing systems suffer from:
- Fragmented tooling — copy-paste between chat, RAG, image, and slide tools
- Ungrounded output — agents hallucinate with no live web/document grounding
- No quality gate — no evals, no safety, no self-correction

This leads to:
- Non-reproducible, untrustworthy deliverables
- Manual rework and silent factual errors in client-facing output

---

## 🎯 Design Goals

- **Local-first & free** — self-hostable, runs on NVIDIA NIM free tier
- **Grounded & safe** — web search + RAG + PII/safety guardrails before output
- **Self-correcting** — measurable quality gate that feeds fixes back upstream
- **Deprecation-proof** — model ids centralized + env-overridable

---

## 💡 Key Innovations

1. **Self-Correction Loop**  
   → A QA/grader failure emits structured `qa_feedback`; the worker re-runs the upstream node with the exact issues injected (versioned attempt N+1). Quality improves automatically instead of failing.

2. **Adaptive Model Routing**  
   → `resolveTextModel(task, ctx)` picks model by task + cost/latency preference, and auto-escalates to a stronger model on retry. All ids live in one central config (env-overridable).

3. **Grounding Pipeline (free)**  
   → Web Search (Tavily→DuckDuckGo→mock) + Document Ingest (PDF/URL→chunked corpus) + Retriever + Reranker, so the analyst cites real sources instead of guessing.

---

## 🧠 Why This Works

Traditional approaches fail because:
- They generate without grounding or a quality gate
- They lock you into one paid provider and brittle hardcoded model ids

This system succeeds because it models:
- **The workflow as a DAG** — explicit, reproducible, inspectable
- **Quality as data** — graders score Tone/ClaimRisk/SourceCoverage/Readability and gate output
- **Provider config as a single source of truth** — a model deprecation is a one-line/env change

→ **Result:** Reproducible, grounded, self-correcting deliverables — free and self-hosted.

---

## 🧱 Why DAG-Based (not a chat loop)?

Autonomous chat-agent loops are opaque and non-deterministic. A DAG gives:

- **Reproducibility** — same graph + inputs → same run, versioned
- **Inspectability** — every node's input/output/score is visible on the canvas
- **Deterministic retries** — self-correction targets the exact failing node, not the whole conversation
- **Explicit grounding paths** — search/ingest/retrieve wire into reasoning as real edges, not hidden tool calls

---

## 🛠️ The Deliverable Pipeline

```text
   Brief / PDF / URL
          ↓
   Grounding        (Web Search · Document Ingest · Retrieve · Rerank)
          ↓
   Reasoning        (Analyst · Decision · Resolver)
          ↓
   Quality Gate     (Eval Graders · Safety · PII)  ──fail──▶ guided feedback ↺
          ↓
   Generation       (LLM · FLUX image)
          ↓
   Deliverable      (PPTX · Markdown · Image · JSON)
```

---

## 🏗️ System Architecture

```text
[Frontend Canvas]  (React + React Flow + Vite)
   ↓ (SDK)
[API Gateway]      (NestJS + Prisma + BullMQ producer)  ──SSE──▶ live canvas
   ↓ (Redis queue)
[Worker]           (Node + BullMQ consumer, runs node manifests)
   ↓
[NVIDIA NIM]       (LLM / embed / rerank / vision / FLUX)  +  [PPT Worker] (FastAPI + python-pptx)
   ↓
[Postgres + LocalStack S3]   (state, metrics, binary assets)
```

---

## 🧩 System Components

### 1. Frontend Canvas (`Frontend/`)
- Visual DAG editor: drag nodes, connect handles, run, inspect.
- Live SSE node status, command palette (⌘K), chat surface, telemetry, onboarding tour.

### 2. API Gateway (`apps/api/`)
- Workflow/run CRUD, BullMQ producer, self-correction retry, agent gateway (NL→pipeline), metrics, SSE event bus.

### 3. Worker (`apps/worker/`)
- BullMQ consumer; executes `NodeManifest.run()`, calls NIM, pushes logs/metrics back to API.

### 4. PPT Worker (`apps/ppt-worker/`)
- FastAPI; PDF→markdown converter, slide classification, AI diagram generation, `python-pptx` rendering.

### 5. Nodes + SDK (`packages/nodes`, `packages/sdk`)
- 23 strongly-typed node manifests + central `models.config.ts`; typed fetch SDK.

---

## 🧰 Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | React 18.3 · Vite 5.4 · TypeScript 5.8 · React Flow 11.11 · TailwindCSS 3.4 + shadcn/ui (Radix) · TanStack Query 5 · React Router 6.30 · Recharts 2.15 · cmdk 1.1 · sonner 1.7 · react-hook-form 7 · Zod 3.25 · Vitest 3.2 |
| **API Gateway** | NestJS 10.4 · Prisma 5.22 · BullMQ 5.51 · RxJS (SSE) · class-validator/transformer |
| **Worker** | Node 20 · BullMQ 5 · ioredis 5 |
| **Nodes pkg** | TypeScript · Zod 3.25 · axios 1.15 · ioredis 5 · sharp 0.34 · @aws-sdk/client-s3 · groq-sdk |
| **PPT / Convert Worker** | Python 3.10+ · FastAPI · Uvicorn · python-pptx · PyMuPDF · pydantic · httpx · boto3 · python-multipart |
| **Data / Infra** | PostgreSQL 15 · Redis 7 · LocalStack (S3) · Docker Compose |
| **Monorepo / Tooling** | Turborepo 2.9 · pnpm 10.33 workspaces |
| **AI Backend** | NVIDIA NIM (OpenAI-compatible) — Kimi-K2, Llama-3.3-70B, Llama-3.1-8B, Llama-Guard-4-12B, nv-embed-v1, nv-rerankqa-mistral-4b-v3, FLUX.1-dev; Web search: Tavily / DuckDuckGo |

---

## 🧠 Model Architecture (NVIDIA NIM)

- **Backbone:** NVIDIA NIM (`https://integrate.api.nvidia.com/v1`), OpenAI-compatible
- **Input:** text / image / PDF / URL
- **Output:** text / JSON / image / PPTX

### Routing (central, env-overridable — `packages/nodes/src/models.config.ts`)

| Role | Default model |
|---|---|
| Reasoning / QA / decision | `moonshotai/kimi-k2-instruct` |
| Mid reasoning / agent / analyst | `meta/llama-3.3-70b-instruct` |
| Fast / classification | `meta/llama-3.1-8b-instruct` |
| Safety | `meta/llama-guard-4-12b` |
| Embed / rerank | `nvidia/nv-embed-v1` · `nvidia/nv-rerankqa-mistral-4b-v3` |
| Image | `black-forest-labs/flux.1-dev` |

> Deprecated `llama-3.1-405b/70b` removed from all call sites. Verify ids at <https://build.nvidia.com/models>.

---

## 📊 Performance Metrics

### ✅ Runtime Verified

| Check | Result |
|---|---|
| CI (tsc ×3 · engine tests · frontend build · py_compile · secret scan) | **green** |
| Engine regression suite | **18/18** assertions |
| Eval harness — pipeline completion (prompt → DAG → exec → completion) | **30/30** cases, **100% structural** (marketing · research · ppt) |
| Self-correction loop | **verified live** — failing node re-executed across attempts, clean halt at limit |

> Run it yourself: `node eval/runner.mjs` (see [`eval/`](eval/)). Telemetry is live in-app via `GET /api/metrics/workflow/:id/dashboard`.

### Target Metrics (content quality — pending live-key validation)

| Metric | Target |
|---|---|
| Pipeline success rate | > 95% |
| Queue latency (Run → pickup) | < 200 ms |
| Text node latency | < 3 s |
| Self-correction recovery (pass on retry) | > 80% |

### Parity (free-tier-achievable features)

| Approach | Coverage |
|---|---|
| OpenAI AgentKit (paid) | baseline |
| Cortexa (free, self-hosted) | ~90% of free-achievable features |

---

## 🔍 Example Output

**Input:**
```text
POST /api/agent/run
{ "prompt": "Research latest NVIDIA NIM models and summarize with citations" }
```

**Output:**
```json
{
  "intent": "RESEARCH",
  "nodes": [{ "id": "search" }, { "id": "analyst" }],
  "output": { "text": "...cited summary...", "confidence": 0.9 }
}
```

---

## 🧪 Experimental Insights

- Centralizing model ids turned a multi-file, two-language deprecation into a one-line fix.
- Deterministic-first node design (PII guard, doc-ingest, web-search) keeps core flows working with zero LLM cost.

**Conclusion:**
→ Grounding + a measurable quality gate matter more than raw model size for trustworthy deliverables.

---

## ⚠️ Limitations & Failure Cases

### Limitations
- Structurally verified end-to-end (30/30 pipelines, mock mode); **content-quality** numbers still pending a live-key run. Opt-in `x-api-key` only — no multi-user auth yet. SSE bus is single-instance (in-memory).
- Agent handoffs are deterministic (mapped), not runtime-dynamic. PDF ingest = digital path only (scanned → flagged, no OCR yet).

### Failure Case Example

**Input:** `scanned image-only PDF dropped on canvas`

**Issue:** `no embedded text → ingest flags "scanned", emits little/no corpus (OCR path not enabled)`

---

## 🚀 Deployment Scenarios

- Agency/consulting: brief → grounded intelligence deck
- Internal research: URL/PDF → cited summary with QA gate
- Marketing: copy + image + QA multi-agent pipeline

---

## 🔁 Reproducibility

- TypeScript + Zod typed node contracts; `tsc` clean across nodes/api/worker/frontend
- Central model config + `.env.example` per app
- Docker Compose for Postgres/Redis/LocalStack/PPT-worker

---

## 📁 Repository Structure

```text
.
├── Frontend/            # React + Vite + React Flow canvas
├── apps/
│   ├── api/             # NestJS gateway (runs, agent, metrics, SSE)
│   ├── worker/          # BullMQ consumer
│   └── ppt-worker/      # FastAPI: PDF→md, slides, diagrams
├── packages/
│   ├── nodes/           # 23 typed node manifests + models.config
│   └── sdk/             # typed client
├── pdf_processing/      # source PDF→md pipeline (NLP project)
├── docker-compose.yaml
└── README.md
```

---

## ⚙️ Quick Start

### Prerequisites
- Node.js 20+ · pnpm 10+ · Docker (Compose) · Python 3.10+

### Setup
```bash
git clone -b v1 https://github.com/AnshBajpai05/Cortexa.git
cd Cortexa

docker compose up -d                 # postgres, redis, localstack, ppt-worker
pnpm install
cp apps/api/.env.example apps/api/.env        # add real NVIDIA keys
cp apps/worker/.env.example apps/worker/.env
pip install -r apps/ppt-worker/requirements.txt
pnpm --filter @cortexa/api prisma migrate deploy
```

### Run
```bash
pnpm dev                             # turbo: api + worker
# Frontend: cd Frontend && pnpm dev
```

### Example API
```bash
curl -X POST http://localhost:3001/api/agent/run \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Summarize agentic AI trends with citations"}'
```

> No keys → worker runs in **MOCK mode** (fake output, logs a loud warning + resolved model map at boot).

---

## 🌍 Impact

- Free, self-hosted alternative to paid agent-builder platforms
- Grounded + safe + self-correcting deliverables, reproducibly

---

## 🔮 Vision

To make **client-ready, grounded AI deliverables** buildable by anyone on free infrastructure — visual, safety-gated, and self-correcting by default.

---

## 📄 License

MIT — see [`LICENSE`](LICENSE). Free to use, modify, and self-host.

---

> Status: engine **hardened + runtime-verified** (CI green · 30/30 pipelines · self-correction loop proven · reconciler + idempotency + generations). Next: live-key content numbers, then tag `v1.0.0`. ⚠️ Rotate any committed API keys before publishing.
