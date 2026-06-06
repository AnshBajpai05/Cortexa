# 🏗️ System Blueprint: Cortexa — Agentic AI Deliverable Platform

**TL;DR:** A local-first, DAG-based agentic orchestration system that converts structured AI workflows into reproducible, client-ready deliverables — powered by NVIDIA NIM multi-model inference.

**Name:** Cortexa  
**Stack Updated:** April 28, 2026  
**AI Backend:** NVIDIA NIM (`https://integrate.api.nvidia.com/v1`) — unified OpenAI-compatible endpoint

---

## 1. Problem Statement

Creative and analytical AI workflows are highly fragmented. Teams need to synthesize information and generate client-facing deliverables (slides, reports, graphics) by bouncing between multiple AI tools. Cortexa solves the orchestration problem by allowing users to construct **visual, automated, multi-agent pipelines** that chain reasoning, memory, safety, vision, and generation into a single reproducible run.

---

## 2. AI Model Architecture (NVIDIA NIM)

All inference routes through `https://integrate.api.nvidia.com/v1` using dedicated per-model API keys.

### Model Routing Table

| Task Type | Model | Key |
|:---|:---|:---|
| Heavy reasoning / evaluation | `moonshotai/kimi-k2-instruct` | `NVIDIA_LLM_KEY` |
| Agentic routing / structured JSON | `z-ai/glm4.7` | `NVIDIA_GLM_KEY` |
| Fast completions / tight loops | `meta/llama-3.1-8b-instruct` | `NVIDIA_LLM_KEY` |
| Safety classification | `meta/llama-guard-4-12b` | `NVIDIA_SAFETY_KEY` |
| Embeddings (primary) | `nvidia/nv-embed-v1` | `NVIDIA_EMBED_KEY` |
| Embeddings (multilingual) | `baai/bge-m3` | `NVIDIA_BGE_KEY` |
| Reranking | `nvidia/nv-rerankqa-mistral-4b-v3` | `NVIDIA_RERANK_KEY` |
| Vision / VLM | `google/paligemma` | `NVIDIA_PALIGEMMA_KEY` |
| OCR | `baidu/paddleocr` | `NVIDIA_OCR_KEY` |
| Image generation | `black-forest-labs/flux1-dev` | `NVIDIA_IMAGE_KEY` |

### `resolveTextModel(task)` — Adaptive Routing

```ts
resolveTextModel("reasoning") → kimi-k2-instruct
resolveTextModel("agent")     → glm4.7
resolveTextModel("fast")      → llama-3.1-8b-instruct
```

---

## 3. System Architecture

### High-Level Components

1. **Client Layer (Frontend):** React Flow visual canvas + Vite + TailwindCSS
2. **API Gateway (NestJS):** Workflow/Run CRUD, BullMQ producer, self-correction loop
3. **Task Queue (Redis/BullMQ):** Broker for pending AI tasks
4. **Worker Node (Node.js):** BullMQ consumer, executes `NodeManifest` logic, calls NVIDIA NIM
5. **Storage:** PostgreSQL (state/metadata) + LocalStack S3 (binary assets)
6. **SDK (`@cortexa/sdk`):** Typed fetch wrapper for all Frontend → API communication

### Data Flow

```
[Frontend] → (SDK) → [NestJS API] → (DB) → (BullMQ) → [Redis] → [Worker]
                                                                      ↓
                                                              [NVIDIA NIM]
                                                                      ↓
                                                               (LocalStack S3)
                                                                      ↓
                                                      (webhook) → [NestJS API]
                                                                      ↓
                                                         (polling) → [Frontend]
```

---

## 4. Node Registry (12 Active Nodes)

### Core Generation
| ID | Node | Model |
|:---|:---|:---|
| `text.run-any-llm` | LLM Text Generator | kimi-k2 / glm4.7 / llama-3.1 |
| `image.compositor` | Image Generator | FLUX.1-dev |

### Logic & Control Flow
| ID | Node | Model |
|:---|:---|:---|
| `logic.orchestrator` | Orchestrator | glm4.7 |
| `logic.decision` | Decision Planner | kimi-k2 |
| `logic.qa-evaluator` | QA Evaluator | glm4.7 |
| `logic.global-evaluator` | Global Evaluator | kimi-k2 |

### Memory & RAG
| ID | Node | Model |
|:---|:---|:---|
| `memory.retriever` | Semantic Retriever | nv-embed-v1 |
| `memory.reranker` | Reranker | nv-rerankqa-mistral-4b-v3 |

### Safety & Vision
| ID | Node | Model |
|:---|:---|:---|
| `safety.llama-guard` | Safety Guard | llama-guard-4-12b |
| `vision.ocr` | OCR Extractor | paddleocr |

---

## 5. Full Execution Pipeline

```
Input
  ↓
Decision Planner (kimi-k2 — choose strategy)
  ↓
Semantic Retriever (nv-embed-v1 — semantic search)
  ↓
Reranker (nv-rerankqa-mistral-4b-v3 — filter to best docs)
  ↓
Vision / OCR (if image input)
  ↓
LLM Generator (kimi-k2 / glm4.7 / llama-3.1)
  ↓
Safety Guard (llama-guard-4-12b)
  ↓
QA Evaluator (glm-4.7, throws QA_FAILED if score < threshold)
  ↓
Guided Self-Correction Loop (sends specific issue feedback upstream)
  ↓
Global Evaluator (kimi-k2 — final pipeline-level judge)
  ↓
Export (text / image / markdown)
```

---

## 6. Self-Correction Loop

When a node throws a structured error (`QA_FAILED` or `SAFETY_BLOCKED`), the worker:

1. Parses the structured error JSON
2. Builds **guided feedback** — not a dumb retry, but specific actionable instructions:
   - QA: `"Your output scored 4/7. Issue: tone too informal. Issue: lacks a call-to-action. Rewrite addressing ALL issues."`
   - Safety: `"Your output was blocked by Llama Guard 4. Violation: hate_speech. Rewrite to avoid this category."`
3. POSTs to `/api/runs/:id/retry-backward` with the feedback array
4. API creates a new versioned `Run` record (attempt N+1) with feedback injected into inputs
5. Text node sees `qa_feedback` in inputs and prepends correction instructions to the prompt

**Max retry attempts:** configurable per-workflow via `jsonGraph.config.maxRetryAttempts` (default: 3)

---

## 7. Data Model

### Core Entities

| Model | Key Fields |
|:---|:---|
| `User` | id, email, role |
| `Workspace` | id, name |
| `Workflow` | id, workspaceId, jsonGraph (DAG), updatedAt |
| `Run` | id, workflowId, nodeId, status, attempt, inputsJson, outputsJson, errorJson |
| `RunLog` | id, runId, nodeId, status, inputJson, outputJson, startedAt |
| `Memory` | id, workflowId, type, key, value |
| `Asset` | id, workspaceId, kind, url |
| `CreditLedger` | id, workspaceId, delta, reason |

---

## 8. SDK (`@cortexa/sdk`)

```ts
import { cortexaSdk } from "@cortexa/sdk";

// Trigger a workflow
await cortexaSdk.runs.trigger(workflowId);

// Poll until finished with live callback
await cortexaSdk.runs.waitUntilFinished(workflowId, {
  intervalMs: 2000,
  onTick: (status) => console.log(status.completed, "/", status.total),
});

// Save canvas
const id = await cortexaSdk.workflows.saveCanvas(nodes, edges, { workspaceId });

// Memory
await cortexaSdk.memory.add(workflowId, { type: "context", key: "brand", value: "..." });
```

---

## 9. Infrastructure

### Docker Services

```yaml
postgres:    postgres:15    → port 5432
redis:       redis:7        → port 6379
localstack:  localstack/localstack (S3 only) → port 4566
```

### Environment Variables (Worker)

```env
NVIDIA_LLM_KEY, NVIDIA_GLM_KEY, NVIDIA_VISION_KEY
NVIDIA_EMBED_KEY, NVIDIA_BGE_KEY, NVIDIA_RERANK_KEY
NVIDIA_PALIGEMMA_KEY, NVIDIA_OCR_KEY, NVIDIA_SAFETY_KEY, NVIDIA_IMAGE_KEY
S3_ENDPOINT, S3_BUCKET, REDIS_HOST, REDIS_PORT
```

---

## 10. Comparison

| Feature | Cortexa | LangChain | Airflow |
|:---|:---|:---|:---|
| **Visual DAG Canvas** | ✅ | ❌ | ❌ |
| **AI-native nodes** | ✅ | ✅ | ❌ |
| **NVIDIA NIM backend** | ✅ | ⚠️ | ❌ |
| **Self-correction loop** | ✅ | ❌ | ❌ |
| **Safety layer** | ✅ | ❌ | ❌ |
| **Full RAG pipeline** | ✅ | ✅ | ❌ |
| **Local-first** | ✅ | ❌ | ❌ |
| **Typed SDK** | ✅ | ❌ | ❌ |

---

## 11. Metrics & KPIs

1. **Pipeline Success Rate** — % of workflows completing all nodes without error (Target: >95%)
2. **Queue Latency** — Time from "Run" click to Worker job pickup (Target: <200ms)
3. **Node Execution Time** — Text nodes <2s, Image nodes <15s (tracked via `startedAt`/`finishedAt`)
4. **Self-Correction Rate** — % of QA failures that pass on retry N+1 (Target: >80%)
5. **Safety Block Rate** — % of outputs flagged by Llama Guard (monitor for model calibration)
