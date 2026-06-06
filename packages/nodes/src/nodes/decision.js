"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decisionNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const DecisionNodeConfig = zod_1.z.object({
    model: zod_1.z
        .enum(["moonshotai/kimi-k2-instruct", "z-ai/glm4.7"])
        .default("moonshotai/kimi-k2-instruct"),
    decisionType: zod_1.z
        .enum(["pipeline_path", "model_selection", "tool_selection", "content_strategy"])
        .default("pipeline_path"),
    maxOptions: zod_1.z.number().int().min(2).max(10).default(5),
    maxIterations: zod_1.z.number().int().min(1).max(5).default(2),
});
const DecisionOutputSchema = zod_1.z.object({
    selected_id: zod_1.z.string(),
    selected_description: zod_1.z.string(),
    reasoning_chain: zod_1.z.string(),
    confidence: zod_1.z.number().min(0).max(1),
    rejected: zod_1.z.array(zod_1.z.object({ id: zod_1.z.string(), reason: zod_1.z.string() })),
});
exports.decisionNode = {
    id: "logic.decision",
    name: "Decision Planner",
    description: "An iterative planning node powered by Kimi-K2. Plans → critiques → refines before committing. Outputs a structured decision with a full reasoning chain.",
    category: "logic",
    costTier: "high",
    avgLatencyMs: 15000,
    inputs: [
        { id: "goal", label: "Goal / Task", type: "text", required: true, semanticType: "text" },
        {
            id: "options",
            label: "Options (JSON array of {id, description} objects)",
            type: "json",
            required: true,
        },
        {
            id: "context",
            label: "Additional Context (optional)",
            type: "text",
            required: false,
        },
    ],
    outputs: [
        { id: "selected_id", label: "Selected Option ID", type: "text", semanticType: "text" },
        { id: "selected_description", label: "Selected Description", type: "text", semanticType: "text" },
        { id: "reasoning_chain", label: "Full Reasoning Chain", type: "text", semanticType: "text" },
        { id: "confidence", label: "Confidence Score", type: "text", semanticType: "text" },
        { id: "rejected", label: "Rejected Options (JSON)", type: "json", semanticType: "json" },
        { id: "iterations_used", label: "Planning Iterations Used", type: "text", semanticType: "text" },
    ],
    configSchema: DecisionNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = DecisionNodeConfig.parse(rawConfig);
        const goal = ctx.inputs["goal"];
        const optionsRaw = ctx.inputs["options"];
        const additionalContext = ctx.inputs["context"];
        if (!goal) {
            throw new Error(`[decisionNode] Missing required input: goal (runId=${ctx.runId})`);
        }
        if (!optionsRaw) {
            throw new Error(`[decisionNode] Missing required input: options (runId=${ctx.runId})`);
        }
        const options = typeof optionsRaw === "string" ? JSON.parse(optionsRaw) : optionsRaw;
        if (!Array.isArray(options) || options.length < 2) {
            throw new Error(`[decisionNode] options must be a JSON array with at least 2 items`);
        }
        const optionList = options
            .slice(0, config.maxOptions)
            .map((o, i) => `${i + 1}. ID: "${o.id}" — ${o.description}`)
            .join("\n");
        const systemPrompt = `You are a strategic AI Decision Planner specializing in ${config.decisionType} decisions.

Your job is to deeply reason through ALL options before committing to a decision.
Think step-by-step. Consider tradeoffs. Then select the BEST option for the goal.

You MUST output ONLY valid JSON with no markdown, in this exact format:
{
  "selected_id": "<exact ID string of the chosen option>",
  "selected_description": "<brief restatement of what was selected>",
  "reasoning_chain": "<detailed multi-step reasoning explaining WHY>",
  "confidence": <float between 0.0 and 1.0>,
  "rejected": [{"id": "<id>", "reason": "<why rejected>"}]
}`;
        const userMessage = `Goal: ${goal}
${additionalContext ? `\nContext:\n${additionalContext}` : ""}

Available Options:
${optionList}

Analyze carefully and make your decision.`;
        console.log(`[decisionNode] Running iterative planning (max ${config.maxIterations} iterations) for: "${goal.slice(0, 60)}..."`);
        const validate = (raw) => {
            try {
                const parsed = JSON.parse(raw);
                const result = DecisionOutputSchema.safeParse(parsed);
                if (result.success)
                    return { success: true, data: result.data };
                return { success: false, error: result.error.message };
            }
            catch (e) {
                return { success: false, error: e.message };
            }
        };
        let currentDecision = (await (0, tools_1.callNimStructured)(userMessage, { model: config.model, systemPrompt, maxTokens: 1500, temperature: 0.15 }, ctx, validate)).data;
        let iterationsUsed = 1;
        for (let i = 1; i < config.maxIterations; i++) {
            console.log(`[decisionNode] Iteration ${i + 1}: critiquing and refining plan...`);
            const critiquePrompt = `You previously made this decision:

Selected: "${currentDecision.selected_id}" — ${currentDecision.selected_description}
Reasoning: ${currentDecision.reasoning_chain}
Confidence: ${currentDecision.confidence}

Goal was: ${goal}
Options were:
${optionList}

Now CRITICALLY evaluate your decision:
1. What assumptions did you make that might be wrong?
2. What risks does this choice carry?
3. Is there a better option you overlooked?
4. Rate your confidence honestly — is ${currentDecision.confidence} accurate?

Respond with a critique paragraph. Be harsh and honest.`;
            const critique = await tools_1.tools.llm("nvidia", critiquePrompt, {
                model: config.model,
                systemPrompt: "You are a critical reviewer. Find weaknesses in decisions. Be specific and actionable.",
                maxTokens: 600,
                temperature: 0.4,
            }, ctx);
            const refinePrompt = `${userMessage}

Your previous decision was: "${currentDecision.selected_id}" (confidence: ${currentDecision.confidence})
Previous reasoning: ${currentDecision.reasoning_chain}

A critical review found these issues:
${critique}

Now make your FINAL decision. You may keep the same option or switch based on the critique.
Output ONLY valid JSON in the same format as before.`;
            const refined = await (0, tools_1.callNimStructured)(refinePrompt, { model: config.model, systemPrompt, maxTokens: 1500, temperature: 0.1 }, ctx, validate);
            iterationsUsed = i + 1;
            currentDecision = {
                ...refined.data,
                reasoning_chain: `[Iteration ${i + 1}] ${refined.data.reasoning_chain}\n\n[Critique from iteration ${i}] ${critique}`,
            };
            if (currentDecision.confidence >= 0.95) {
                console.log(`[decisionNode] High confidence (${currentDecision.confidence}) — stopping early at iteration ${iterationsUsed}`);
                break;
            }
        }
        return {
            value: currentDecision.selected_id,
            selected_id: currentDecision.selected_id,
            selected_description: currentDecision.selected_description,
            reasoning_chain: currentDecision.reasoning_chain,
            confidence: currentDecision.confidence,
            rejected: currentDecision.rejected,
            iterations_used: iterationsUsed,
            label: `Decision: "${currentDecision.selected_id}" (${(currentDecision.confidence * 100).toFixed(0)}% conf, ${iterationsUsed} iterations)`,
            explanation: `${config.decisionType} via ${config.model}. Selected "${currentDecision.selected_id}" from ${options.length} options after ${iterationsUsed} iteration(s).`,
        };
    },
};
//# sourceMappingURL=decision.js.map