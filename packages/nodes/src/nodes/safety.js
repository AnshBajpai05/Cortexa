"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safetyNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const SafetyNodeConfig = zod_1.z.object({
    failOnUnsafe: zod_1.z.boolean().default(true),
    checkLabel: zod_1.z.string().optional(),
});
exports.safetyNode = {
    id: "safety.llama-guard",
    name: "Safety Guard",
    description: "Classifies input/output content as Safe or Unsafe using meta/llama-guard-4-12b. Optionally blocks the pipeline on unsafe content.",
    category: "safety",
    costTier: "low",
    avgLatencyMs: 1000,
    inputs: [
        {
            id: "content",
            label: "Content to Check",
            type: "any",
            required: true,
        },
    ],
    outputs: [
        { id: "safe", label: "Is Safe", type: "any", semanticType: "text" },
        { id: "category", label: "Violation Category", type: "text", semanticType: "text" },
        { id: "content_passthrough", label: "Content (if safe)", type: "any", semanticType: "text" },
        { id: "raw_verdict", label: "Raw Verdict", type: "text", semanticType: "text" },
    ],
    configSchema: SafetyNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = SafetyNodeConfig.parse(rawConfig);
        const content = ctx.inputs["content"];
        if (content === undefined || content === null) {
            throw new Error(`[safetyNode] Missing required input: content (runId=${ctx.runId})`);
        }
        const contentString = typeof content === "string" ? content : JSON.stringify(content, null, 2);
        const label = config.checkLabel ?? "content";
        console.log(`[safetyNode] Running Llama Guard 4 on ${label} (${contentString.length} chars)...`);
        const verdict = await tools_1.tools.safety(contentString, ctx);
        if (!verdict.safe && config.failOnUnsafe) {
            throw new Error(JSON.stringify({
                type: "SAFETY_BLOCKED",
                message: `Content classified as UNSAFE by Llama Guard 4.`,
                category: verdict.category,
                raw: verdict.raw,
            }));
        }
        return {
            value: verdict.safe,
            safe: verdict.safe,
            category: verdict.category,
            content_passthrough: verdict.safe ? content : null,
            raw_verdict: verdict.raw,
            label: verdict.safe ? "✅ Safe" : `⛔ Unsafe (${verdict.category})`,
            explanation: `Llama Guard 4 classified ${label} as "${verdict.safe ? "SAFE" : "UNSAFE"}". ${verdict.safe ? "Content passes safety layer." : `Violation category: ${verdict.category}.`}`,
            confidence: 0.99,
        };
    },
};
//# sourceMappingURL=safety.js.map