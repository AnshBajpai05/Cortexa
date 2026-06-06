import axios from "axios";
import { z } from "zod";
import Redis from "ioredis";
import { RunContext } from "./types";
import crypto from "crypto";
import { MODELS } from "./models.config";

// ─── NVIDIA NIM base URL ─────────────────────────────────────────────────────
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";

// ─── Model Profiles (Cost / Latency Awareness) ──────────────────────────────
// Re-exported from the central config so the routing table and the profile
// table can never drift apart again.
export {
  MODELS,
  MODEL_PROFILES,
  getModelProfile,
  type ModelProfile,
} from "./models.config";

// ─── Model Routing ────────────────────────────────────────────────────────────

export type TaskType =
  | "reasoning"     // Complex multi-step reasoning → Kimi-K2
  | "qa"            // Quality evaluation → Kimi-K2 (strict + deep)
  | "agent"         // Tool-use, routing, structured JSON → GLM-4.7
  | "decision"      // Strategic planning → Kimi-K2
  | "fast"          // Tight loops, simple completions → Llama-3.1-8b
  | "safety"        // Safety classification → Llama-3.1-8b
  | "default";      // General purpose → Kimi-K2

export interface RouteOptions {
  task: TaskType;
  /** "fast" prefers low-latency models, "quality" prefers high-capability models */
  preference?: "fast" | "quality" | "balanced";
}

// ─── Redis Caching Layer ─────────────────────────────────────────────────────

let redisClient: Redis | null = null;

function getRedis(ctx: RunContext): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: ctx.env.REDIS_HOST,
      port: ctx.env.REDIS_PORT,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null // don't retry, fail fast
    });
    redisClient.on('error', (err) => {
      // Catch unhandled connection errors to avoid crashing worker
    });
  }
  return redisClient;
}

async function getCached<T>(ctx: RunContext, key: string): Promise<T | null> {
  try {
    const redis = getRedis(ctx);
    const val = await redis.get(`cortexa:cache:${key}`);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    return null;
  }
}

async function setCached(ctx: RunContext, key: string, val: any, ttl = 3600): Promise<void> {
  try {
    const redis = getRedis(ctx);
    await redis.set(`cortexa:cache:${key}`, JSON.stringify(val), "EX", ttl);
  } catch (err) {
    // Silent fail for cache
  }
}

function hashKey(parts: any[]): string {
  const str = JSON.stringify(parts);
  return crypto.createHash("sha256").update(str).digest("hex");
}

/**
 * Adaptive model router — selects the optimal model based on task type
 * AND cost/latency preference. This is what production systems do.
 */
export function resolveTextModel(taskOrOptions: TaskType | RouteOptions, ctx?: RunContext): string {
  // 1. Priority 1: Explicit model request always wins
  if (typeof taskOrOptions === "object" && (taskOrOptions as any).model) {
    return (taskOrOptions as any).model;
  }

  const task = (typeof taskOrOptions === "string" ? taskOrOptions : taskOrOptions.task) || "default";
  const preference = typeof taskOrOptions === "string" ? "balanced" : (taskOrOptions.preference ?? "balanced");

  // ── Adaptive Escalation ────────────────────────────────────────────────────
  // If we are on a retry attempt (attempt > 1), automatically escalate to
  // a higher capability model regardless of task or preference.
  if (ctx && ctx.attempt > 1) {
    console.log(`[resolveTextModel] Escalating model for attempt ${ctx.attempt}...`);
    switch (task) {
      case "fast":
      case "safety":
        return MODELS.reasoningMid; // Upgrade fast tier -> mid reasoning
      default:
        return MODELS.reasoning; // Everything else -> top reasoning tier
    }
  }

  // Fast preference: downgrade everything possible to the cheapest model
  if (preference === "fast") {
    switch (task) {
      case "reasoning":
      case "decision":
      case "qa":
        return MODELS.reasoningMid; // downgrade from top tier to mid
      default:
        return MODELS.fast;
    }
  }

  // Quality preference: upgrade everything to the top reasoning tier
  if (preference === "quality") {
    switch (task) {
      case "fast":
      case "safety":
        return MODELS.fast;
      default:
        return MODELS.reasoning;
    }
  }

  // Balanced (default): original routing intent
  switch (task) {
    case "agent":
      return MODELS.agent;
    case "fast":
    case "safety":
      return MODELS.fast;
    case "reasoning":
    case "qa":
    case "decision":
    case "default":
    default:
      return MODELS.reasoning;
  }
}

// ─── Option Interfaces ────────────────────────────────────────────────────────

export interface LLMOptions {
  task?: TaskType;
  preference?: "fast" | "quality" | "balanced";
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface EmbedOptions {
  model?: string;
  inputType?: "query" | "passage";
}

export interface RerankOptions {
  model?: string;
  topN?: number;
}

export interface VisionOptions {
  model?: string;
  maxTokens?: number;
}

export interface ImageOptions {
  model?: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  numInferenceSteps?: number;
  cfgScale?: number;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function isRealKey(key: string | undefined): boolean {
  return !!key && !key.startsWith("mock") && key !== "";
}

function pickLlmKey(model: string, ctx: RunContext): string {
  if (model.startsWith("z-ai") || model.includes("glm")) {
    return ctx.env.NVIDIA_GLM_KEY;
  }
  return ctx.env.NVIDIA_LLM_KEY;
}

async function nvidiaPost<T = any>(
  endpoint: string,
  apiKey: string,
  payload: Record<string, unknown>,
  responseType: "json" | "arraybuffer" = "json",
  maxRetries = 2
): Promise<T> {
  const url = `${NVIDIA_BASE}${endpoint}`;
  let attempt = 0;
  while (attempt <= maxRetries) {
    console.log(`[nvidiaPost] POST ${url} | key=${apiKey.slice(0,12)}... | model=${(payload as any).model ?? 'N/A'} | attempt=${attempt}`);
    try {
      const response = await axios.post<T>(url, payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        responseType,
        timeout: 300_000, // 5 min — accommodates large high-density generations
      });
      console.log(`[nvidiaPost] Response status=${response.status} | dataType=${typeof response.data} | hasChoices=${!!(response.data as any)?.choices}`);
      return response.data;
    } catch (err: any) {
      const status = err.response?.status;
      const body = err.response?.data;
      console.error(`[nvidiaPost] FAILED status=${status} | body=${JSON.stringify(body)?.slice(0,500)} | msg=${err.message}`);
      
      if (status === 429 && attempt < maxRetries) {
        attempt++;
        const waitMs = attempt * 10000; // Exponential backoff: 10s, 20s
        console.warn(`[nvidiaPost] Hit 429 Rate Limit. Backing off for ${waitMs}ms before attempt ${attempt}...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      
      throw err;
    }
  }
  throw new Error("nvidiaPost max retries exceeded");
}

// ─── Structured Output Helper ─────────────────────────────────────────────────

/**
 * Calls NIM LLM and parses the response as JSON matching a schema.
 * If the LLM returns invalid JSON, retries once with a correction prompt.
 * This is the structured output enforcement layer.
 *
 * @param validate — a function that returns { success: true, data: T } or { success: false, error: string }
 */
export async function callNimStructured<T>(
  prompt: string,
  options: LLMOptions,
  ctx: RunContext,
  validate: (raw: string) => { success: true; data: T } | { success: false; error: string },
  maxRetries: number = 1,
): Promise<{ data: T; raw: string; attempts: number }> {
  const model = options.model || MODELS.reasoning;
  const apiKey = pickLlmKey(model, ctx);
  console.log(`[callNimStructured] model=${model} | keyPrefix=${apiKey?.slice(0,12)} | isReal=${isRealKey(apiKey)}`);

  let lastRaw = "";
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const currentPrompt = attempt === 1
      ? prompt
      : `${prompt}\n\n[SYSTEM: Your previous response was invalid JSON. Error: "${lastRaw}". Please return ONLY valid JSON matching the required schema. No markdown, no explanation, just the JSON object.]`;

    if (!isRealKey(apiKey)) {
      // Mock mode
      console.warn(`[callNimStructured] MOCK MODE — key is empty or invalid`);
      lastRaw = '{"mock": true}';
      const result = validate(lastRaw);
      if (result.success) return { data: result.data, raw: lastRaw, attempts: attempt };
      continue;
    }

    const messages: { role: string; content: string }[] = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt + "\n\nYou MUST respond with valid JSON only. No markdown fences, no explanations." });
    }
    messages.push({ role: "user", content: currentPrompt });

    const data = await nvidiaPost<any>("/chat/completions", apiKey, {
      model,
      messages,
      max_tokens: options.maxTokens || 4096,
      temperature: options.temperature ?? 0.3, // lower temp for structured
      stream: false,
    });

    lastRaw = data.choices?.[0]?.message?.content ?? "";
    console.log(`[callNimStructured] Attempt ${attempt} | rawLength=${lastRaw.length} | first100=${JSON.stringify(lastRaw.slice(0,100))}`);

    // Guard: if NVIDIA returned empty content, skip parse and retry
    if (!lastRaw || lastRaw.trim().length === 0) {
      lastRaw = "Empty response from NVIDIA API";
      console.warn(`[callNimStructured] Empty response from model ${model}, will retry...`);
      continue;
    }

    // Robust JSON extraction: Find the first { and last }
    let cleaned = lastRaw.trim();
    
    // If it's wrapped in markdown code blocks, strip them
    cleaned = cleaned.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    
    const startIdx = cleaned.indexOf("{");
    const endIdx = cleaned.lastIndexOf("}");
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      cleaned = cleaned.substring(startIdx, endIdx + 1);
    }

    // --- ROBUST SANITIZER ---
    const sanitized = cleaned
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Nuke all control chars
      .replace(/[“”]/g, '"') // Smart quotes to straight
      .replace(/[‘’]/g, "'") // Smart single quotes
      .replace(/,\s*([}\]])/g, "$1"); // Remove trailing commas

    const result = validate(sanitized);
    if (result.success) {
      return { data: result.data, raw: sanitized, attempts: attempt };
    }
    lastRaw = (result as any).error ?? sanitized;
  }

  throw new Error(`[callNimStructured] Failed to get valid structured output after ${maxRetries + 1} attempts. Last error: ${lastRaw}`);
}

// ─── Tool Surface ─────────────────────────────────────────────────────────────

export const tools = {
  // ─── LLM ──────────────────────────────────────────────────────────────────
  llm: async (
    provider: "nvidia" | "groq" | "mock",
    prompt: string,
    options: LLMOptions,
    ctx: RunContext
  ): Promise<string> => {
    const model = resolveTextModel(options as any, ctx);
    const { systemPrompt = "", temperature = 0.7 } = options;
    const cacheKey = hashKey(["llm", model, prompt, systemPrompt, temperature]);

    // Check cache
    const cached = await getCached<string>(ctx, cacheKey);
    if (cached && ctx.attempt === 1) {
      console.log(`[RedisCache] HIT: ${cacheKey.slice(0, 8)}`);
      return cached;
    }

    const apiKey = pickLlmKey(model, ctx);

    if (provider === "mock" || !isRealKey(apiKey)) {
      console.warn(`[tools.llm] ⚠️  MOCK MODE for model=${model} — no real NVIDIA key resolved. Returning fake output.`);
      await new Promise((r) => setTimeout(r, 800));
      return `[MOCK] Generated response for: "${prompt.slice(0, 100)}…"\n\n(Mock mode — set a real NVIDIA API key to enable live inference.)`;
    }

    const messages: { role: string; content: string }[] = [];
    if (options.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const data = await nvidiaPost<any>("/chat/completions", apiKey, {
      model,
      messages,
      max_tokens: options.maxTokens || 1024,
      temperature,
      stream: false,
    });

    const result = data.choices?.[0]?.message?.content ?? "";
  
    // Set cache (TTL 1 hour)
    await setCached(ctx, cacheKey, result);

    return result;
  },

  // ─── Embeddings ───────────────────────────────────────────────────────────
  embed: async (
    texts: string[],
    options: EmbedOptions,
    ctx: RunContext
  ): Promise<number[][]> => {
    // Note: Simple implementation supports single-text cache for demonstration
    const text = texts[0];
    const cacheKey = hashKey(["embed", text]);
    const cached = await getCached<number[]>(ctx, cacheKey);
    if (cached) return [cached];

    const model = options.model || MODELS.embed;
    const apiKey = model.includes("bge")
      ? ctx.env.NVIDIA_BGE_KEY
      : ctx.env.NVIDIA_EMBED_KEY;

    if (!isRealKey(apiKey)) {
      console.warn("[tools.embed] No real embedding key — returning zero vectors.");
      return texts.map(() => new Array(1024).fill(0));
    }

    const data = await nvidiaPost<any>("/embeddings", apiKey, {
      input: texts,
      model,
      input_type: options.inputType || "query",
      encoding_format: "float",
    });

    const result = data.data.map((d: { embedding: number[] }) => d.embedding);
    await setCached(ctx, cacheKey, result[0], 86400 * 7); // Cache embeddings for 7 days
    return result;
  },

  // ─── Reranking ────────────────────────────────────────────────────────────
  rerank: async (
    query: string,
    passages: string[],
    options: RerankOptions,
    ctx: RunContext
  ): Promise<{ index: number; relevance_score: number }[]> => {
    const cacheKey = hashKey(["rerank", query, passages]);
    const cached = await getCached<{ index: number; relevance_score: number }[]>(ctx, cacheKey);
    if (cached) return cached;

    const apiKey = ctx.env.NVIDIA_RERANK_KEY;

    if (!isRealKey(apiKey)) {
      console.warn("[tools.rerank] No real rerank key — returning identity scores.");
      return passages.map((_, i) => ({ index: i, relevance_score: 0.5 }));
    }

    const model = options.model || MODELS.rerank;
    const data = await nvidiaPost<any>("/ranking", apiKey, {
      model,
      query: { text: query },
      passages: passages.map((p) => ({ text: p })),
      truncate: "END",
    });

    const results: { index: number; relevance_score: number }[] = data.rankings;
    const final = options.topN ? results.slice(0, options.topN) : results;
    await setCached(ctx, cacheKey, final, 3600 * 24);
    return final;
  },

  // ─── Vision / VLM ────────────────────────────────────────────────────────
  vision: async (
    imageBase64: string,
    prompt: string,
    options: VisionOptions,
    ctx: RunContext
  ): Promise<string> => {
    const apiKey = ctx.env.NVIDIA_PALIGEMMA_KEY;

    if (!isRealKey(apiKey)) {
      return `[MOCK] VLM analysis: "${prompt}" (set NVIDIA_PALIGEMMA_KEY to enable live inference)`;
    }

    const model = options.model || MODELS.vision;
    const data = await nvidiaPost<any>("/chat/completions", apiKey, {
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
            { type: "text", text: prompt },
          ],
        },
      ],
      max_tokens: options.maxTokens || 512,
      stream: false,
    });

    return data.choices?.[0]?.message?.content ?? "";
  },

  // ─── OCR ──────────────────────────────────────────────────────────────────
  ocr: async (
    imageBase64: string,
    ctx: RunContext
  ): Promise<{ text: string; bboxes: unknown[] }> => {
    const apiKey = ctx.env.NVIDIA_OCR_KEY;

    if (!isRealKey(apiKey)) {
      return { text: "[MOCK] OCR extracted text.", bboxes: [] };
    }

    const data = await nvidiaPost<any>("/chat/completions", apiKey, {
      model: MODELS.ocr,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
            },
            {
              type: "text",
              text: 'Extract all text from this image. Return JSON with keys "text" (full extracted text) and "bboxes" (array of {text, x1, y1, x2, y2} objects).',
            },
          ],
        },
      ],
      max_tokens: 2048,
      stream: false,
    });

    const raw = data.choices?.[0]?.message?.content ?? "";
    try {
      return JSON.parse(raw);
    } catch {
      return { text: raw, bboxes: [] };
    }
  },

  // ─── Safety ───────────────────────────────────────────────────────────────
  safety: async (
    content: string,
    ctx: RunContext
  ): Promise<{ safe: boolean; category: string; raw: string }> => {
    const apiKey = ctx.env.NVIDIA_SAFETY_KEY;

    if (!isRealKey(apiKey)) {
      return { safe: true, category: "mock", raw: "[MOCK] Safety check skipped." };
    }

    const data = await nvidiaPost<any>("/chat/completions", apiKey, {
      model: MODELS.safety,
      messages: [{ role: "user", content }],
      max_tokens: 64,
      stream: false,
    });

    const raw: string = data.choices?.[0]?.message?.content ?? "safe";
    const safe = raw.trim().toLowerCase().startsWith("safe");
    const category = safe ? "safe" : raw.split("\n")[1]?.trim() ?? "unknown";

    return { safe, category, raw };
  },

  // ─── Image Generation ─────────────────────────────────────────────────────
  image: async (
    provider: "nvidia" | "mock",
    prompt: string,
    options: ImageOptions,
    ctx: RunContext
  ): Promise<{ buffer: Buffer | null; url: string | null; provider: string }> => {
    const apiKey = ctx.env.NVIDIA_IMAGE_KEY;

    if (provider === "mock" || !isRealKey(apiKey)) {
      await new Promise((r) => setTimeout(r, 3000));
      return {
        buffer: null,
        url: `https://placehold.co/1024x1024/000000/FFFFFF/png?text=FLUX+Failed+-+Fallback+Active`,
        provider: "mock",
      };
    }

    let data: any;
    try {
      // Clean prompt: remove newlines and curly quotes which can break some NIM models
      const cleanPrompt = prompt.replace(/\n/g, " ").replace(/[\u201c\u201d]/g, '"');
      
      const payload = {
        prompt: cleanPrompt,
        seed: Math.floor(Math.random() * 1000000),
        width: 1024,
        height: 1024,
      };
      
      console.log(`[tools.image] Calling NVIDIA Flux with sanitized prompt...`);

      const response = await axios.post<any>("https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev", payload, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 120_000,
      });

      data = response.data;
      console.log(`[tools.image] Raw response keys: ${Object.keys(data).join(", ")}`);
      if (data.status === "error" || data.message) {
        console.error(`[tools.image] API Error message: ${data.message || JSON.stringify(data)}`);
      }
    } catch (err: any) {
      console.error(`[tools.image] Error:`, err.response?.data || err.message);
      return { 
        buffer: null, 
        url: `https://placehold.co/1024x1024/000000/FFFFFF/png?text=FLUX+Failed+-+Fallback+Active`, 
        provider: "mock" 
      };
    }

    let b64: string | undefined = (data as any).b64_json || (data as any).data?.[0]?.b64_json || (data as any).artifacts?.[0]?.base64;
    if (!b64) {
      console.error("[tools.image] NVIDIA FLUX returned unknown format:", JSON.stringify(data).slice(0, 500));
      throw new Error("[tools.image] NVIDIA FLUX returned no image data.");
    }

    if (b64.startsWith("data:")) {
      b64 = b64.split(",")[1];
    }

    const buffer = Buffer.from(b64, "base64");
    
    if (buffer.length < 5000) {
       console.error(`[tools.image] Buffer too small (${buffer.length} bytes), likely a failed generation.`);
       throw new Error("NVIDIA NIM returned an invalid/empty image buffer.");
    }

    console.log(`[tools.image] Successfully generated image (${buffer.length} bytes)`);

    return {
      buffer,
      url: null,
      provider: "nvidia-flux",
    };
  },
};
