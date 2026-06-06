/**
 * ─── Central Model Configuration ────────────────────────────────────────────
 *
 * SINGLE SOURCE OF TRUTH for every NVIDIA NIM model id used anywhere in Cortexa.
 *
 * Why this file exists:
 *   Model ids used to be hardcoded as string literals across ~6 files in two
 *   languages (TS + Python). When NVIDIA deprecated `meta/llama-3.1-405b-instruct`
 *   and `meta/llama-3.1-70b-instruct`, the whole agent + PPT pipeline silently
 *   broke. Now a catalog change is a one-line edit here (or an env var) instead
 *   of a code hunt.
 *
 * Every id is overridable via environment variable so deprecations can be fixed
 * WITHOUT a code change / rebuild. Defaults below are the current recommended
 * models — verify against https://build.nvidia.com/models before relying on them.
 *
 * The Python ppt-worker mirrors these env var names (see slide_classifier.py).
 */

function env(key: string, fallback: string): string {
  const v = typeof process !== "undefined" ? process.env?.[key] : undefined;
  return v && v.trim() ? v.trim() : fallback;
}

export const MODELS = {
  // Heavy reasoning, evaluation, planning, QA — the "smartest" tier.
  reasoning: env("CORTEXA_MODEL_REASONING", "moonshotai/kimi-k2-instruct"),

  // Mid-tier reasoning / formatting / fast-structured work.
  // Replaces the DEPRECATED meta/llama-3.1-70b-instruct.
  reasoningMid: env("CORTEXA_MODEL_REASONING_MID", "meta/llama-3.3-70b-instruct"),

  // Agentic tool-use, routing, structured JSON.
  agent: env("CORTEXA_MODEL_AGENT", "meta/llama-3.3-70b-instruct"),

  // Deep strategic analyst (long, high-density reports).
  // Replaces the DEPRECATED meta/llama-3.1-405b-instruct.
  analyst: env("CORTEXA_MODEL_ANALYST", "meta/llama-3.3-70b-instruct"),

  // Blazing-fast / cheap completions, classification, tight loops.
  fast: env("CORTEXA_MODEL_FAST", "meta/llama-3.1-8b-instruct"),

  // Safety classification.
  safety: env("CORTEXA_MODEL_SAFETY", "meta/llama-guard-4-12b"),

  // Embeddings.
  embed: env("CORTEXA_MODEL_EMBED", "nvidia/nv-embed-v1"),
  embedMultilingual: env("CORTEXA_MODEL_EMBED_ML", "baai/bge-m3"),

  // Reranking.
  rerank: env("CORTEXA_MODEL_RERANK", "nvidia/nv-rerankqa-mistral-4b-v3"),

  // Vision / VLM + OCR.
  vision: env("CORTEXA_MODEL_VISION", "google/paligemma"),
  ocr: env("CORTEXA_MODEL_OCR", "baidu/paddleocr"),

  // Image generation (FLUX).
  image: env("CORTEXA_MODEL_IMAGE", "black-forest-labs/flux.1-dev"),
} as const;

export type ModelRole = keyof typeof MODELS;

// ─── Model Profiles (Cost / Latency Awareness) ──────────────────────────────

export interface ModelProfile {
  id: string;
  costTier: "low" | "medium" | "high";
  avgLatencyMs: number;
  maxTokens: number;
  strengths: string[];
}

/**
 * Profiles keyed by the *role* default id. Built dynamically so it always
 * stays in sync with whatever MODELS resolves to (no more drift between the
 * routing table and the profile table).
 */
const ROLE_PROFILES: Record<string, Omit<ModelProfile, "id">> = {
  [MODELS.reasoning]: {
    costTier: "high",
    avgLatencyMs: 3000,
    maxTokens: 8192,
    strengths: ["reasoning", "evaluation", "planning", "complex-analysis"],
  },
  [MODELS.reasoningMid]: {
    costTier: "medium",
    avgLatencyMs: 1800,
    maxTokens: 4096,
    strengths: ["reasoning", "formatting", "structured-json", "agentic"],
  },
  [MODELS.fast]: {
    costTier: "low",
    avgLatencyMs: 600,
    maxTokens: 2048,
    strengths: ["fast", "simple-tasks", "classification", "safety"],
  },
};

export const MODEL_PROFILES: Record<string, ModelProfile> = Object.fromEntries(
  Object.entries(ROLE_PROFILES).map(([id, p]) => [id, { id, ...p }])
);

export function getModelProfile(modelId: string): ModelProfile | undefined {
  return MODEL_PROFILES[modelId];
}

/**
 * Lightweight startup audit — logs the resolved model map + any obviously
 * unset keys. Call once on boot so MOCK mode / missing config is never silent.
 */
export function auditModelConfig(env: Record<string, string | undefined> = {}): void {
  console.log("[models.config] Resolved model map:");
  for (const [role, id] of Object.entries(MODELS)) {
    console.log(`  • ${role.padEnd(18)} → ${id}`);
  }
  const keyVars = [
    "NVIDIA_LLM_KEY",
    "NVIDIA_GLM_KEY",
    "NVIDIA_EMBED_KEY",
    "NVIDIA_RERANK_KEY",
    "NVIDIA_SAFETY_KEY",
    "NVIDIA_IMAGE_KEY",
  ];
  const missing = keyVars.filter((k) => {
    const val = env[k];
    return !val || val.startsWith("mock");
  });
  if (missing.length) {
    console.warn(
      `[models.config] ⚠️  MOCK MODE for: ${missing.join(", ")} — these calls will return fake output until real NVIDIA keys are set.`
    );
  }
}
