"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolverNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const ResolverNodeConfig = zod_1.z.object({
    model: zod_1.z.string().default("moonshotai/kimi-k2-instruct"),
});
exports.resolverNode = {
    id: "logic.resolver",
    name: "Decision Resolver",
    description: "Synthesizes conflicting agent perspectives (e.g. Analyst vs Executive) and the consensus report into a final, unified executive decision.",
    category: "logic",
    costTier: "high",
    avgLatencyMs: 58000,
    inputs: [
        { id: "analyst_output", label: "Analyst/Context Output", type: "text", required: true, semanticType: "text" },
        { id: "executive_output", label: "Executive Output", type: "text", required: false, semanticType: "text" },
        { id: "conflict_report", label: "Consensus Report", type: "text", required: false, semanticType: "text" },
        { id: "adversary_report", label: "Attack Report", type: "text", required: false, semanticType: "text" },
    ],
    outputs: [
        { id: "text", label: "Structured Reasoning", type: "text", semanticType: "text" },
    ],
    configSchema: ResolverNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = ResolverNodeConfig.parse(rawConfig);
        const analystOutput = ctx.inputs["analyst_output"];
        const executiveOutput = ctx.inputs["executive_output"] || "N/A";
        const conflictReport = ctx.inputs["conflict_report"] || "N/A";
        const adversaryReport = ctx.inputs["adversary_report"] || "N/A";
        const systemPrompt = `You are a Senior Strategic Mediator and Executive Decision Maker.
Your task is to take conflicting/aligned agent reports, a conflict analysis, AND an Adversarial Attack Report.
You must produce a single, unified, ARGUMENTATIVE FINAL DECISION.

CRITICAL RULES:
1. CONCISE_MODE: ON. Be brilliant but brief. Do not overthink or provide filler.
2. NEVER act as a simple pass-through. Even if they agree, you must provide a higher-level summary abstraction and strategic framing.
3. DEFEND against the adversary. You must explicitly accept valid attacks (and alter the decision) or reject weak attacks with strong counter-evidence.
4. If they disagree, do NOT simply average the two. Understand the underlying variance (e.g., Risk-Averse vs. Strategic-Growth) and provide a reasoned synthesis that a CEO can act upon. Highlight the nuance.

DO NOT output JSON.
DO NOT include extra commentary.
STRICT LIMIT: Keep your entire response under 500 words.

Produce a structured decision in the EXACT format below:

DECISION: <GO | NO_GO | CONDITIONAL_GO | PIVOT | UNKNOWN>

REASONING:
- <key point 1>
- <key point 2>
- <key point 3>

RISKS:
- <risk 1>
- <risk 2>

CONFIDENCE: <number between 0 and 1>

NOTES:
<optional free text>

Be concise but precise.`;
        const userMessage = `Analyst Perspective:\n${analystOutput}\n\nExecutive Perspective:\n${executiveOutput}\n\nConflict/Consensus Report:\n${conflictReport}\n\nAdversarial Attack:\n${adversaryReport}`;
        let rawText = "";
        try {
            rawText = await tools_1.tools.llm("nvidia", userMessage, {
                model: config.model,
                systemPrompt,
                maxTokens: 1500,
                temperature: 0.3,
            }, ctx);
        }
        catch (e) {
            console.error(`[Resolver] LLM Call Failed: ${e.message}`);
            rawText = `DECISION: UNKNOWN\n\nREASONING:\n- Resolver failed to generate output due to error: ${e.message}\n\nRISKS:\n- Pipeline integrity compromised\n\nCONFIDENCE: 0.0`;
        }
        if (!rawText || rawText.trim().length === 0) {
            rawText = `DECISION: UNKNOWN\n\nREASONING:\n- Resolver returned an empty response.\n\nRISKS:\n- Pipeline integrity compromised\n\nCONFIDENCE: 0.0`;
        }
        return {
            value: rawText,
            text: rawText,
            label: `Decision Processed`,
            explanation: `Resolved via ${config.model}.`,
        };
    },
};
//# sourceMappingURL=resolver.js.map