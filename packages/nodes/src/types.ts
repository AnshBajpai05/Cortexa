import { z } from "zod";

// ─── Run Context ────────────────────────────────────────────────────────────
// Injected into every node's run() at execution time by the Worker
export interface RunContext {
  runId: string;
  workflowId: string;
  nodeId: string;
  /** Current execution attempt (1-indexed) */
  attempt: number;
  /** Resolved outputs from all upstream parent nodes */
  inputs: Record<string, unknown>;
  /** Environment secrets — injected by Worker, never stored in DB */
  env: {
    // ── Legacy providers (kept for backward compat) ──────────────────────────
    GROQ_API_KEY: string;
    HUGGINGFACE_API_KEY: string;
    // ── LocalStack S3 ────────────────────────────────────────────────────────
    S3_ENDPOINT: string;
    S3_BUCKET: string;
    // ── NVIDIA NIM — per-model keys (all routed via integrate.api.nvidia.com) ─
    /** moonshotai/kimi-k2-instruct + meta/llama-3.1-8b-instruct */
    NVIDIA_LLM_KEY: string;
    /** z-ai/glm4.7  (GLM-4.7 agentic tool-use) */
    NVIDIA_GLM_KEY: string;
    /** google/gemma-3-27b-it  (general vision) */
    NVIDIA_VISION_KEY: string;
    /** nvidia/nv-embed-v1  (primary embedding model) */
    NVIDIA_EMBED_KEY: string;
    /** baai/bge-m3  (fallback embedding model) */
    NVIDIA_BGE_KEY: string;
    /** nvidia/nv-rerankqa-mistral-4b-v3  (reranker) */
    NVIDIA_RERANK_KEY: string;
    /** google/paligemma  (VLM reasoning) */
    NVIDIA_PALIGEMMA_KEY: string;
    /** baidu/paddleocr  (document / table OCR) */
    NVIDIA_OCR_KEY: string;
    /** meta/llama-guard-4-12b  (safety classification) */
    NVIDIA_SAFETY_KEY: string;
    /** black-forest-labs/flux1-dev  (image generation) */
    NVIDIA_IMAGE_KEY: string;
    // ── Web Search (free-tier grounding) ─────────────────────────────────────
    /** tavily.com free tier — optional; falls back to keyless DuckDuckGo */
    TAVILY_API_KEY?: string;
    // ── Redis (Caching) ──────────────────────────────────────────────────────
    REDIS_HOST: string;
    REDIS_PORT: number;
    API_URL: string;
  };
}

// ─── Node Output ─────────────────────────────────────────────────────────────
export interface NodeOutput {
  /** The primary output value passed downstream to child nodes */
  value?: unknown;
  /** Optional S3 URL if the node produced a binary asset */
  assetUrl?: string;
  /** Human-readable label for displaying in the canvas */
  label?: string;
  /** Optional explainability metadata to describe what the node did */
  explanation?: string;
  /** Confidence score (0 to 1) indicating the node's certainty in its output */
  confidence?: number;
  /** Allow any custom fields returned by specialized nodes (e.g., score, feedback) */
  [key: string]: any;
}

// ─── Semantic Types ──────────────────────────────────────────────────────────
// Minimal set — describes WHAT data means, not just its format
export type SemanticType = "text" | "json" | "image" | "decision";

// ─── Port Definition ─────────────────────────────────────────────────────────
// Describes a typed input or output connector on a node
export interface PortDefinition {
  id: string;
  label: string;
  type: "text" | "image" | "json" | "any";
  required?: boolean;
  /** Semantic type hint for the Graph Validator and future Planner */
  semanticType?: SemanticType;
}

// ─── Node Manifest ────────────────────────────────────────────────────────────
// The core contract — every Agent Node must export one of these
export interface NodeManifest {
  /** Globally unique node type identifier e.g. "text.run-any-llm" */
  id: string;
  /** Display name shown on the canvas */
  name: string;
  /** Short description of what this agent does */
  description: string;
  /** Category for grouping in the node picker sidebar */
  category: "text" | "image" | "logic" | "input" | "output" | "safety" | "vision" | "memory";
  /** Cost tier for routing awareness */
  costTier?: "low" | "medium" | "high";
  /** Average expected latency in milliseconds */
  avgLatencyMs?: number;
  /** Input port definitions */
  inputs: PortDefinition[];
  /** Output port definitions */
  outputs: PortDefinition[];
  /** Zod schema to validate the node's configuration panel values */
  configSchema: z.ZodTypeAny;
  /** The actual execution logic — called by the Worker */
  run: (ctx: RunContext, config: unknown) => Promise<NodeOutput>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────
export type NodeRegistry = Map<string, NodeManifest>;
