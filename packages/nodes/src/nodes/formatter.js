"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatterNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const FormatterNodeConfig = zod_1.z.object({
    model: zod_1.z.string().default("meta/llama-3.1-8b-instruct"),
});
const FormatterOutputSchema = zod_1.z.object({
    decision: zod_1.z.enum(["GO", "NO_GO", "CONDITIONAL_GO", "PIVOT", "UNKNOWN"]),
    reasoning: zod_1.z.array(zod_1.z.string()),
    risks: zod_1.z.array(zod_1.z.string()),
    confidence: zod_1.z.number(),
    notes: zod_1.z.string().optional().default(""),
});
exports.formatterNode = {
    id: "logic.formatter",
    name: "JSON Formatter",
    description: "Converts free-form structured reasoning text into strict JSON.",
    category: "logic",
    costTier: "low",
    avgLatencyMs: 4000,
    inputs: [
        { id: "resolver_output", label: "Resolver Output", type: "text", required: true, semanticType: "text" },
    ],
    outputs: [
        { id: "decision", label: "Decision", type: "text", semanticType: "text" },
        { id: "reasoning", label: "Reasoning Array", type: "text", semanticType: "text" },
        { id: "risks", label: "Risks Array", type: "text", semanticType: "text" },
        { id: "historical_context", label: "Context String", type: "text", semanticType: "text" },
        { id: "context", label: "Context String", type: "text", semanticType: "text" },
    ],
    configSchema: FormatterNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = FormatterNodeConfig.parse(rawConfig);
        const resolverOutput = ctx.inputs["resolver_output"];
        const systemPrompt = `You are a strict JSON formatter.

Your task:
Convert the following structured text into VALID JSON.

RULES:
- Output ONLY JSON
- No explanations
- No extra text
- Ensure valid syntax (commas, quotes, brackets)
- All fields must exist
- If missing, infer conservatively

If you cannot parse the input, return:
{
  "decision": "UNKNOWN",
  "reasoning": ["Parsing failed"],
  "risks": [],
  "confidence": 0.3,
  "notes": "formatter_fallback"
}

TARGET JSON SCHEMA:
{
  "decision": "GO | NO_GO | CONDITIONAL_GO | PIVOT | UNKNOWN",
  "reasoning": ["string", "string"],
  "risks": ["string"],
  "confidence": number,
  "notes": "string"
}`;
        const userMessage = `INPUT:\n---\n${resolverOutput}\n---\n\nOUTPUT:`;
        const validate = (raw) => {
            try {
                const parsed = JSON.parse(raw);
                const result = FormatterOutputSchema.safeParse(parsed);
                if (result.success)
                    return { success: true, data: result.data };
                return { success: false, error: result.error.message };
            }
            catch (e) {
                return { success: false, error: e.message };
            }
        };
        let result;
        let parseStatus = "success";
        try {
            const { data } = await (0, tools_1.callNimStructured)(userMessage, {
                model: config.model,
                systemPrompt,
                maxTokens: 1000,
                temperature: 0.1,
            }, ctx, validate);
            result = data;
        }
        catch (e) {
            console.error(`[Formatter] LLM JSON Extraction Failed: ${e.message}. Using Hard Fallback.`);
            result = {
                decision: "UNKNOWN",
                reasoning: ["Formatter timeout or crash"],
                risks: [],
                confidence: 0.3,
                notes: "hard_fallback"
            };
            parseStatus = "fallback";
        }
        result.confidence = Math.max(0, Math.min(1, result.confidence));
        if (!result.reasoning || result.reasoning.length === 0) {
            result.reasoning = ["No reasoning provided"];
        }
        const combinedContext = `DECISION: ${result.decision}\n\nREASONING:\n${result.reasoning.map(r => "- " + r).join("\n")}\n\nRISKS:\n${result.risks?.map(r => "- " + r).join("\n") || "None"}`;
        return {
            value: result.decision,
            decision: result.decision,
            reasoning: result.reasoning,
            risks: result.risks,
            historical_context: combinedContext,
            context: combinedContext,
            confidence: result.confidence,
            meta: {
                parse_status: parseStatus,
            },
            label: `Formatted: ${result.decision}`,
            explanation: `Formatted via ${config.model} (Status: ${parseStatus}).`,
        };
    },
};
//# sourceMappingURL=formatter.js.map