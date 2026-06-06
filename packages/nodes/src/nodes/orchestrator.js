"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orchestratorNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const OrchestratorNodeConfig = zod_1.z.object({
    model: zod_1.z
        .enum(["z-ai/glm4.7", "moonshotai/kimi-k2-instruct", "meta/llama-3.1-8b-instruct"])
        .default("z-ai/glm4.7"),
});
exports.orchestratorNode = {
    id: "logic.orchestrator",
    name: "Orchestrator",
    description: "Light planning node powered by GLM-4.7 that evaluates a goal against available options and decides the next route.",
    configSchema: OrchestratorNodeConfig,
    category: "logic",
    costTier: "medium",
    avgLatencyMs: 3000,
    inputs: [
        { id: "goal", label: "Goal", type: "text", required: true, semanticType: "text" },
        { id: "options", label: "Options (JSON)", type: "json", required: true, semanticType: "json" },
    ],
    outputs: [
        { id: "route", label: "Selected Route", type: "text", semanticType: "text" },
        { id: "explanation", label: "Reasoning", type: "text", semanticType: "text" },
    ],
    async run(ctx, rawConfig) {
        const config = OrchestratorNodeConfig.parse(rawConfig);
        const goal = ctx.inputs["goal"];
        const optionsRaw = ctx.inputs["options"];
        if (!goal || !optionsRaw) {
            throw new Error(`[orchestratorNode] Missing required inputs: goal or options (runId=${ctx.runId})`);
        }
        const optionsString = typeof optionsRaw === "string"
            ? optionsRaw
            : JSON.stringify(optionsRaw, null, 2);
        const systemPrompt = `You are an Orchestrator. Your job is to select the BEST route from the provided options to achieve the user's goal.
You MUST output ONLY valid JSON in the following format, with no markdown formatting:
{
  "route": "<exact key/id of the selected option>",
  "explanation": "<brief reasoning for why this route was chosen>",
  "confidence": <number between 0.0 and 1.0>
}
`;
        const userMessage = `Goal:\n${goal}\n\nAvailable Options:\n${optionsString}`;
        const routingString = await tools_1.tools.llm("nvidia", userMessage, {
            model: config.model,
            systemPrompt,
            maxTokens: 300,
            temperature: 0.1,
        }, ctx);
        let result;
        try {
            result = JSON.parse(routingString);
        }
        catch (e) {
            result = {
                route: "default",
                explanation: "Failed to parse orchestrator output.",
                confidence: 0.0,
            };
        }
        return {
            route: result.route,
            explanation: `Routed to "${result.route}" via ${config.model}. Reasoning: ${result.explanation}`,
            confidence: result.confidence || 0.8,
        };
    },
};
//# sourceMappingURL=orchestrator.js.map