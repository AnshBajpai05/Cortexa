"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tools = exports.MODEL_PROFILES = void 0;
exports.getModelProfile = getModelProfile;
exports.resolveTextModel = resolveTextModel;
exports.callNimStructured = callNimStructured;
const axios_1 = __importDefault(require("axios"));
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = __importDefault(require("crypto"));
const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
exports.MODEL_PROFILES = {
    "moonshotai/kimi-k2-instruct": {
        id: "moonshotai/kimi-k2-instruct",
        costTier: "high",
        avgLatencyMs: 3000,
        maxTokens: 8192,
        strengths: ["reasoning", "evaluation", "planning", "complex-analysis"],
    },
    "z-ai/glm4.7": {
        id: "z-ai/glm4.7",
        costTier: "medium",
        avgLatencyMs: 1800,
        maxTokens: 4096,
        strengths: ["tool-use", "structured-json", "routing", "agentic"],
    },
    "meta/llama-3.1-8b-instruct": {
        id: "meta/llama-3.1-8b-instruct",
        costTier: "low",
        avgLatencyMs: 600,
        maxTokens: 2048,
        strengths: ["fast", "simple-tasks", "classification", "safety"],
    },
};
function getModelProfile(modelId) {
    return exports.MODEL_PROFILES[modelId];
}
let redisClient = null;
function getRedis(ctx) {
    if (!redisClient) {
        redisClient = new ioredis_1.default({
            host: ctx.env.REDIS_HOST,
            port: ctx.env.REDIS_PORT,
            maxRetriesPerRequest: 1,
            retryStrategy: () => null
        });
        redisClient.on('error', (err) => {
        });
    }
    return redisClient;
}
async function getCached(ctx, key) {
    try {
        const redis = getRedis(ctx);
        const val = await redis.get(`cortexa:cache:${key}`);
        return val ? JSON.parse(val) : null;
    }
    catch (err) {
        return null;
    }
}
async function setCached(ctx, key, val, ttl = 3600) {
    try {
        const redis = getRedis(ctx);
        await redis.set(`cortexa:cache:${key}`, JSON.stringify(val), "EX", ttl);
    }
    catch (err) {
    }
}
function hashKey(parts) {
    const str = JSON.stringify(parts);
    return crypto_1.default.createHash("sha256").update(str).digest("hex");
}
function resolveTextModel(taskOrOptions, ctx) {
    if (typeof taskOrOptions === "object" && taskOrOptions.model) {
        return taskOrOptions.model;
    }
    const task = (typeof taskOrOptions === "string" ? taskOrOptions : taskOrOptions.task) || "default";
    const preference = typeof taskOrOptions === "string" ? "balanced" : (taskOrOptions.preference ?? "balanced");
    if (ctx && ctx.attempt > 1) {
        console.log(`[resolveTextModel] Escalating model for attempt ${ctx.attempt}...`);
        switch (task) {
            case "fast":
            case "safety":
                return "z-ai/glm4.7";
            default:
                return "moonshotai/kimi-k2-instruct";
        }
    }
    if (preference === "fast") {
        switch (task) {
            case "reasoning":
            case "decision":
                return "z-ai/glm4.7";
            case "qa":
                return "z-ai/glm4.7";
            default:
                return "meta/llama-3.1-8b-instruct";
        }
    }
    if (preference === "quality") {
        switch (task) {
            case "fast":
            case "safety":
                return "meta/llama-3.1-8b-instruct";
            default:
                return "moonshotai/kimi-k2-instruct";
        }
    }
    switch (task) {
        case "agent":
            return "z-ai/glm4.7";
        case "fast":
        case "safety":
            return "meta/llama-3.1-8b-instruct";
        case "reasoning":
        case "qa":
        case "decision":
        case "default":
        default:
            return "moonshotai/kimi-k2-instruct";
    }
}
function isRealKey(key) {
    return !!key && !key.startsWith("mock") && key !== "";
}
function pickLlmKey(model, ctx) {
    if (model.startsWith("z-ai") || model.includes("glm")) {
        return ctx.env.NVIDIA_GLM_KEY;
    }
    return ctx.env.NVIDIA_LLM_KEY;
}
async function nvidiaPost(endpoint, apiKey, payload, responseType = "json") {
    const url = `${NVIDIA_BASE}${endpoint}`;
    console.log(`[nvidiaPost] POST ${url} | key=${apiKey.slice(0, 12)}... | model=${payload.model ?? 'N/A'}`);
    try {
        const response = await axios_1.default.post(url, payload, {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            responseType,
            timeout: 300000,
        });
        console.log(`[nvidiaPost] Response status=${response.status} | dataType=${typeof response.data} | hasChoices=${!!response.data?.choices}`);
        return response.data;
    }
    catch (err) {
        const status = err.response?.status;
        const body = err.response?.data;
        console.error(`[nvidiaPost] FAILED status=${status} | body=${JSON.stringify(body)?.slice(0, 500)} | msg=${err.message}`);
        throw err;
    }
}
async function callNimStructured(prompt, options, ctx, validate, maxRetries = 1) {
    const model = options.model || "moonshotai/kimi-k2-instruct";
    const apiKey = pickLlmKey(model, ctx);
    console.log(`[callNimStructured] model=${model} | keyPrefix=${apiKey?.slice(0, 12)} | isReal=${isRealKey(apiKey)}`);
    let lastRaw = "";
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const currentPrompt = attempt === 1
            ? prompt
            : `${prompt}\n\n[SYSTEM: Your previous response was invalid JSON. Error: "${lastRaw}". Please return ONLY valid JSON matching the required schema. No markdown, no explanation, just the JSON object.]`;
        if (!isRealKey(apiKey)) {
            console.warn(`[callNimStructured] MOCK MODE — key is empty or invalid`);
            lastRaw = '{"mock": true}';
            const result = validate(lastRaw);
            if (result.success)
                return { data: result.data, raw: lastRaw, attempts: attempt };
            continue;
        }
        const messages = [];
        if (options.systemPrompt) {
            messages.push({ role: "system", content: options.systemPrompt + "\n\nYou MUST respond with valid JSON only. No markdown fences, no explanations." });
        }
        messages.push({ role: "user", content: currentPrompt });
        const data = await nvidiaPost("/chat/completions", apiKey, {
            model,
            messages,
            max_tokens: options.maxTokens || 4096,
            temperature: options.temperature ?? 0.3,
            stream: false,
        });
        lastRaw = data.choices?.[0]?.message?.content ?? "";
        console.log(`[callNimStructured] Attempt ${attempt} | rawLength=${lastRaw.length} | first100=${JSON.stringify(lastRaw.slice(0, 100))}`);
        if (!lastRaw || lastRaw.trim().length === 0) {
            lastRaw = "Empty response from NVIDIA API";
            console.warn(`[callNimStructured] Empty response from model ${model}, will retry...`);
            continue;
        }
        let cleaned = lastRaw.trim();
        const startIdx = cleaned.indexOf("{");
        const endIdx = cleaned.lastIndexOf("}");
        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            cleaned = cleaned.substring(startIdx, endIdx + 1);
        }
        const sanitized = cleaned
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
        const result = validate(sanitized);
        if (result.success) {
            return { data: result.data, raw: sanitized, attempts: attempt };
        }
        lastRaw = result.error ?? sanitized;
    }
    throw new Error(`[callNimStructured] Failed to get valid structured output after ${maxRetries + 1} attempts. Last error: ${lastRaw}`);
}
exports.tools = {
    llm: async (provider, prompt, options, ctx) => {
        const model = resolveTextModel(options, ctx);
        const { systemPrompt = "", temperature = 0.7 } = options;
        const cacheKey = hashKey(["llm", model, prompt, systemPrompt, temperature]);
        const cached = await getCached(ctx, cacheKey);
        if (cached && ctx.attempt === 1) {
            console.log(`[RedisCache] HIT: ${cacheKey.slice(0, 8)}`);
            return cached;
        }
        const apiKey = pickLlmKey(model, ctx);
        if (provider === "mock" || !isRealKey(apiKey)) {
            await new Promise((r) => setTimeout(r, 800));
            return `[MOCK] Generated response for: "${prompt.slice(0, 100)}…"\n\n(Mock mode — set a real NVIDIA API key to enable live inference.)`;
        }
        const messages = [];
        if (options.systemPrompt) {
            messages.push({ role: "system", content: options.systemPrompt });
        }
        messages.push({ role: "user", content: prompt });
        const data = await nvidiaPost("/chat/completions", apiKey, {
            model,
            messages,
            max_tokens: options.maxTokens || 1024,
            temperature,
            stream: false,
        });
        const result = data.choices?.[0]?.message?.content ?? "";
        await setCached(ctx, cacheKey, result);
        return result;
    },
    embed: async (texts, options, ctx) => {
        const text = texts[0];
        const cacheKey = hashKey(["embed", text]);
        const cached = await getCached(ctx, cacheKey);
        if (cached)
            return [cached];
        const model = options.model || "nvidia/nv-embed-v1";
        const apiKey = model.includes("bge")
            ? ctx.env.NVIDIA_BGE_KEY
            : ctx.env.NVIDIA_EMBED_KEY;
        if (!isRealKey(apiKey)) {
            console.warn("[tools.embed] No real embedding key — returning zero vectors.");
            return texts.map(() => new Array(1024).fill(0));
        }
        const data = await nvidiaPost("/embeddings", apiKey, {
            input: texts,
            model,
            input_type: options.inputType || "query",
            encoding_format: "float",
        });
        const result = data.data.map((d) => d.embedding);
        await setCached(ctx, cacheKey, result[0], 86400 * 7);
        return result;
    },
    rerank: async (query, passages, options, ctx) => {
        const cacheKey = hashKey(["rerank", query, passages]);
        const cached = await getCached(ctx, cacheKey);
        if (cached)
            return cached;
        const apiKey = ctx.env.NVIDIA_RERANK_KEY;
        if (!isRealKey(apiKey)) {
            console.warn("[tools.rerank] No real rerank key — returning identity scores.");
            return passages.map((_, i) => ({ index: i, relevance_score: 0.5 }));
        }
        const model = options.model || "nvidia/nv-rerankqa-mistral-4b-v3";
        const data = await nvidiaPost("/ranking", apiKey, {
            model,
            query: { text: query },
            passages: passages.map((p) => ({ text: p })),
            truncate: "END",
        });
        const results = data.rankings;
        const final = options.topN ? results.slice(0, options.topN) : results;
        await setCached(ctx, cacheKey, final, 3600 * 24);
        return final;
    },
    vision: async (imageBase64, prompt, options, ctx) => {
        const apiKey = ctx.env.NVIDIA_PALIGEMMA_KEY;
        if (!isRealKey(apiKey)) {
            return `[MOCK] VLM analysis: "${prompt}" (set NVIDIA_PALIGEMMA_KEY to enable live inference)`;
        }
        const model = options.model || "google/paligemma";
        const data = await nvidiaPost("/chat/completions", apiKey, {
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
    ocr: async (imageBase64, ctx) => {
        const apiKey = ctx.env.NVIDIA_OCR_KEY;
        if (!isRealKey(apiKey)) {
            return { text: "[MOCK] OCR extracted text.", bboxes: [] };
        }
        const data = await nvidiaPost("/chat/completions", apiKey, {
            model: "baidu/paddleocr",
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
        }
        catch {
            return { text: raw, bboxes: [] };
        }
    },
    safety: async (content, ctx) => {
        const apiKey = ctx.env.NVIDIA_SAFETY_KEY;
        if (!isRealKey(apiKey)) {
            return { safe: true, category: "mock", raw: "[MOCK] Safety check skipped." };
        }
        const data = await nvidiaPost("/chat/completions", apiKey, {
            model: "meta/llama-guard-4-12b",
            messages: [{ role: "user", content }],
            max_tokens: 64,
            stream: false,
        });
        const raw = data.choices?.[0]?.message?.content ?? "safe";
        const safe = raw.trim().toLowerCase().startsWith("safe");
        const category = safe ? "safe" : raw.split("\n")[1]?.trim() ?? "unknown";
        return { safe, category, raw };
    },
    image: async (provider, prompt, options, ctx) => {
        const apiKey = ctx.env.NVIDIA_IMAGE_KEY;
        if (provider === "mock" || !isRealKey(apiKey)) {
            await new Promise((r) => setTimeout(r, 3000));
            return {
                buffer: null,
                url: `https://placehold.co/1024x1024/000000/FFFFFF/png?text=FLUX+Failed+-+Fallback+Active`,
                provider: "mock",
            };
        }
        let data;
        try {
            const cleanPrompt = prompt.replace(/\n/g, " ").replace(/[\u201c\u201d]/g, '"');
            const payload = {
                prompt: cleanPrompt,
                seed: Math.floor(Math.random() * 1000000),
            };
            console.log(`[tools.image] Calling NVIDIA Flux with sanitized prompt...`);
            const response = await axios_1.default.post("https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev", payload, {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                timeout: 120000,
            });
            data = response.data;
            console.log(`[tools.image] Raw response keys: ${Object.keys(data).join(", ")}`);
            if (data.status === "error" || data.message) {
                console.error(`[tools.image] API Error message: ${data.message || JSON.stringify(data)}`);
            }
        }
        catch (err) {
            console.error(`[tools.image] Error:`, err.response?.data || err.message);
            return { buffer: null, url: null, provider: "mock" };
        }
        let b64 = data.b64_json || data.data?.[0]?.b64_json || data.artifacts?.[0]?.base64;
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
//# sourceMappingURL=tools.js.map