"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.consensusNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const ConsensusNodeConfig = zod_1.z.object({
    model: zod_1.z.string().default("moonshotai/kimi-k2-instruct"),
    threshold: zod_1.z.number().min(0).max(1).default(0.8),
});
const ConsensusOutputSchema = zod_1.z.object({
    consensus_score: zod_1.z.number().min(0).max(1),
    aligned: zod_1.z.boolean(),
    points_of_conflict: zod_1.z.array(zod_1.z.string()),
    explanation: zod_1.z.string(),
});
exports.consensusNode = {
    id: "logic.consensus",
    name: "Consensus Detector",
    description: "Compares two agent outputs (Analyst vs Executive) and detects specific points of conflict or perspective variance.",
    category: "logic",
    costTier: "medium",
    avgLatencyMs: 3000,
    inputs: [
        { id: "input_a", label: "Agent A Output", type: "text", required: true, semanticType: "text" },
        { id: "input_b", label: "Agent B Output", type: "text", required: true, semanticType: "text" },
    ],
    outputs: [
        { id: "consensus_score", label: "Consensus Score", type: "text", semanticType: "text" },
        { id: "aligned", label: "Is Aligned?", type: "text", semanticType: "text" },
        { id: "points_of_conflict", label: "Conflict Points", type: "json", semanticType: "json" },
    ],
    configSchema: ConsensusNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = ConsensusNodeConfig.parse(rawConfig);
        const inputA = ctx.inputs["input_a"];
        const inputB = ctx.inputs["input_b"];
        if (!inputA || !inputB) {
            throw new Error(`[consensusNode] Missing required inputs for comparison.`);
        }
        const systemPrompt = `You are a neutral Consensus Validator.
Your task is to compare two agent reports and determine if they are aligned in their final decision and core reasoning.

Perspective variance (e.g., one is risk-heavy, one is growth-heavy) is acceptable, but direct contradictions in the GO/NO-GO decision should result in a low consensus score.

You MUST output ONLY valid JSON in this format:
{
  "consensus_score": <float 0-1>,
  "aligned": <boolean, true if score >= ${config.threshold}>,
  "points_of_conflict": ["list specific contradictions or variances"],
  "explanation": "brief summary of agreement/disagreement"
}`;
        const userMessage = `Agent A Output:\n${inputA}\n\n---\n\nAgent B Output:\n${inputB}`;
        const validate = (raw) => {
            try {
                const parsed = JSON.parse(raw);
                const result = ConsensusOutputSchema.safeParse(parsed);
                if (result.success)
                    return { success: true, data: result.data };
                return { success: false, error: result.error.message };
            }
            catch (e) {
                return { success: false, error: e.message };
            }
        };
        const { data: result } = await (0, tools_1.callNimStructured)(userMessage, {
            model: config.model,
            systemPrompt,
            maxTokens: 1000,
            temperature: 0.1,
        }, ctx, validate);
        return {
            value: result.aligned ? "ALIGNED" : "MISMATCH",
            consensus_score: result.consensus_score,
            aligned: result.aligned,
            points_of_conflict: result.points_of_conflict,
            explanation: result.explanation,
            label: `Consensus: ${(result.consensus_score * 100).toFixed(0)}% (${result.aligned ? "Aligned" : "Mismatch"})`,
            confidence: 0.95,
        };
    },
};
//# sourceMappingURL=consensus.js.map