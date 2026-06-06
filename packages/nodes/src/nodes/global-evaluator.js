"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.globalEvaluatorNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const GlobalEvaluatorNodeConfig = zod_1.z.object({
    model: zod_1.z
        .enum(["moonshotai/kimi-k2-instruct", "z-ai/glm4.7", "meta/llama-3.1-8b-instruct"])
        .default("moonshotai/kimi-k2-instruct"),
    globalRubric: zod_1.z
        .string()
        .default("Evaluate if the pipeline successfully completed its overarching goal and produced high-quality output."),
});
exports.globalEvaluatorNode = {
    id: "logic.global-evaluator",
    name: "Global Evaluator",
    description: "System-level evaluator powered by Kimi-K2 that judges the entire pipeline result for strategy and success.",
    configSchema: GlobalEvaluatorNodeConfig,
    category: "logic",
    costTier: "medium",
    avgLatencyMs: 5000,
    inputs: [
        { id: "final_output", label: "Final Pipeline Output", type: "any", required: true, semanticType: "text" },
        { id: "original_goal", label: "Original Goal", type: "text", required: true, semanticType: "text" },
    ],
    outputs: [
        { id: "strategy_score", label: "Strategy Score", type: "text", semanticType: "text" },
        { id: "passed", label: "Passed", type: "any", semanticType: "text" },
        { id: "strategic_feedback", label: "Strategic Feedback", type: "text", semanticType: "text" },
        { id: "confidence", label: "Confidence", type: "text", semanticType: "text" },
    ],
    async run(ctx, rawConfig) {
        const config = GlobalEvaluatorNodeConfig.parse(rawConfig);
        const finalOutput = ctx.inputs["final_output"];
        const originalGoal = ctx.inputs["original_goal"];
        if (!finalOutput || !originalGoal) {
            throw new Error(`[globalEvaluator] Missing required inputs: final_output or original_goal`);
        }
        const outputString = typeof finalOutput === "string"
            ? finalOutput
            : JSON.stringify(finalOutput, null, 2);
        const systemPrompt = `You are the Global System Evaluator.
Your job is to evaluate if the AI pipeline successfully achieved its overarching goal.
Rubric: "${config.globalRubric}"

You MUST output ONLY valid JSON in the following format, with no markdown formatting:
{
  "strategy_score": <number between 0 and 100>,
  "passed": <boolean>,
  "strategic_feedback": "<system-level feedback on strategy and execution>",
  "confidence": <number between 0.0 and 1.0>
}
`;
        const userMessage = `Original Goal:\n${originalGoal}\n\nFinal Pipeline Output:\n${outputString}`;
        const evaluationString = await tools_1.tools.llm("nvidia", userMessage, {
            model: config.model,
            systemPrompt,
            maxTokens: 500,
            temperature: 0.1,
        }, ctx);
        let result;
        try {
            result = JSON.parse(evaluationString);
        }
        catch (e) {
            result = {
                strategy_score: 0,
                passed: false,
                strategic_feedback: "Failed to parse evaluation response.",
                confidence: 0.0,
            };
        }
        return {
            strategy_score: result.strategy_score,
            passed: result.passed,
            strategic_feedback: result.strategic_feedback,
            explanation: `Global evaluation via ${config.model}: ${result.passed ? "PASSED ✅" : "FAILED ❌"} — score ${result.strategy_score}/100.`,
            confidence: result.confidence || 0.9,
        };
    },
};
//# sourceMappingURL=global-evaluator.js.map