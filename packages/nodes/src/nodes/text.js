"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.textNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const TextNodeConfig = zod_1.z.object({
    systemPrompt: zod_1.z.string().default("You are a helpful assistant."),
    model: zod_1.z
        .enum([
        "moonshotai/kimi-k2-instruct",
        "z-ai/glm4.7",
        "meta/llama-3.1-8b-instruct",
    ])
        .default("moonshotai/kimi-k2-instruct"),
    maxTokens: zod_1.z.number().int().min(1).max(8192).default(1024),
    temperature: zod_1.z.number().min(0).max(1).default(0.7),
    role: zod_1.z.string().optional(),
    goal: zod_1.z.string().optional(),
    saveToMemoryKey: zod_1.z.string().optional(),
    requireContext: zod_1.z.enum(["hard", "soft", "none"]).default("none"),
    jsonSchema: zod_1.z.string().optional(),
    prompt: zod_1.z.string().optional(),
});
exports.textNode = {
    id: "text.run-any-llm",
    name: "LLM Text Generator",
    description: "Calls NVIDIA NIM inference with support for grounding enforcement and typed JSON contracts.",
    category: "text",
    costTier: "medium",
    avgLatencyMs: 3000,
    inputs: [
        {
            id: "prompt",
            label: "Prompt",
            type: "text",
            required: true,
        },
        {
            id: "context",
            label: "Context (optional)",
            type: "text",
            required: false,
        },
        {
            id: "historical_context",
            label: "Historical Context (optional)",
            type: "text",
            required: false,
        },
    ],
    outputs: [
        {
            id: "text",
            label: "Generated Text",
            type: "text",
        },
    ],
    configSchema: TextNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = TextNodeConfig.parse(rawConfig);
        const prompt = (ctx.inputs["prompt"] ||
            ctx.inputs["text"] ||
            ctx.inputs["output_text"] ||
            ctx.inputs["value"] ||
            config.prompt);
        const context = ctx.inputs["context"];
        const memoryContext = ctx.inputs["workspace_context"];
        if (!prompt) {
            throw new Error(`[textNode] Missing required input: prompt (runId=${ctx.runId}). Available: ${Object.keys(ctx.inputs).join(", ")}`);
        }
        const hasContext = !!(context || memoryContext);
        if (config.requireContext === "hard" && !hasContext) {
            throw new Error(JSON.stringify({
                type: "UNGROUNDED_EXECUTION",
                message: `Grounding failed: Node "${ctx.nodeId}" requires context but none was provided. Hallucination risk too high.`,
            }));
        }
        const groundingConfidenceModifier = !hasContext && config.requireContext === "soft" ? 0.3 : 0;
        let systemPrompt = config.systemPrompt;
        if (config.role) {
            systemPrompt = `You are a ${config.role}.\nYour goal: ${config.goal || "Follow instructions strictly."}\n${systemPrompt}`;
        }
        const historicalContext = ctx.inputs["historical_context"];
        let userMessage = context
            ? `Context:\n${context}\n\nTask:\n${prompt}`
            : prompt;
        if (historicalContext) {
            userMessage = `${historicalContext}\n\n---\n\n${userMessage}`;
        }
        if (memoryContext) {
            userMessage = `System Memory / Brand Context:\n${memoryContext}\n\n---\n\n${userMessage}`;
        }
        const qaFeedback = ctx.inputs["qa_feedback"];
        if (qaFeedback) {
            let issuesText = "";
            if (Array.isArray(qaFeedback)) {
                issuesText = qaFeedback.map((issue) => `- ${issue}`).join("\n");
            }
            else {
                issuesText = String(qaFeedback);
            }
            userMessage += `\n\n[URGENT] Your previous attempt failed Quality Assurance.\nSpecific issues to fix:\n${issuesText}\n\nPlease rewrite and fix these exact issues.`;
        }
        let text;
        let confidence;
        let structuredData = null;
        if (config.jsonSchema) {
            const structuredSystemPrompt = `${systemPrompt}\n\nYou MUST output ONLY valid JSON matching this schema: ${config.jsonSchema}\nNo markdown formatting.`;
            const validate = (raw) => {
                try {
                    const parsed = JSON.parse(raw);
                    return { success: true, data: parsed };
                }
                catch (e) {
                    return { success: false, error: e.message };
                }
            };
            const { data } = await (0, tools_1.callNimStructured)(userMessage, {
                model: config.model,
                systemPrompt: structuredSystemPrompt,
                maxTokens: config.maxTokens,
                temperature: config.temperature,
            }, ctx, validate);
            structuredData = data;
            text = typeof data === "string" ? data : JSON.stringify(data);
            confidence = data.confidence ?? 0.92;
        }
        else {
            text = await tools_1.tools.llm("nvidia", userMessage, {
                model: config.model,
                systemPrompt,
                maxTokens: config.maxTokens,
                temperature: config.temperature,
            }, ctx);
            const len = text.length;
            confidence = Math.min(0.98, Math.max(0.3, 0.5 + (len / 2000) * 0.4));
        }
        confidence = Math.max(0.1, confidence - groundingConfidenceModifier);
        if (config.saveToMemoryKey && text) {
            try {
                const memoryPayload = {
                    type: config.jsonSchema ? "json" : "text",
                    key: config.saveToMemoryKey,
                    value: text,
                };
                const apiUrl = ctx.env.API_URL || "http://localhost:3001/api";
                await fetch(`${apiUrl}/workflows/${ctx.workflowId}/memory`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(memoryPayload),
                });
                console.log(`[textNode] Saved to memory with key: ${config.saveToMemoryKey}`);
            }
            catch (err) {
                console.error(`[textNode] Failed to save memory: ${err.message}`);
            }
        }
        return {
            value: text,
            text,
            label: config.jsonSchema
                ? `${structuredData.headline || structuredData.title || text.slice(0, 30)}…`
                : text.slice(0, 40) + "…",
            explanation: config.jsonSchema
                ? `Generated structured response via ${config.model} as ${config.role || "Analyst"}. Grounding: ${config.requireContext || "none"}.`
                : `Generated ${text.length} characters of reasoning via ${config.model}.`,
            confidence: confidence,
            groundingMode: config.requireContext || "none",
            structuredData,
            ...(config.jsonSchema ? structuredData : {}),
        };
    },
};
//# sourceMappingURL=text.js.map