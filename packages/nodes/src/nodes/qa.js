"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qaNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const QANodeConfig = zod_1.z.object({
    model: zod_1.z
        .enum(["z-ai/glm4.7", "moonshotai/kimi-k2-instruct", "meta/llama-3.1-8b-instruct"])
        .default("z-ai/glm4.7"),
    rubric: zod_1.z.string().default("Check if the text is polite, professional, and accurate."),
    threshold: zod_1.z.number().min(0).max(10).default(7),
});
const QAOutputSchema = zod_1.z.object({
    score: zod_1.z.number().min(0).max(10),
    issues: zod_1.z.array(zod_1.z.string()),
    confidence: zod_1.z.number().min(0).max(1),
});
exports.qaNode = {
    id: "logic.qa-evaluator",
    name: "QA Evaluator",
    description: "Evaluates text against a rubric using GLM-4.7 with schema-enforced structured output. Fails the pipeline if the score is too low, triggering the self-correction loop.",
    configSchema: QANodeConfig,
    category: "logic",
    costTier: "medium",
    avgLatencyMs: 5000,
    inputs: [{ id: "input_text", label: "Input Text", type: "text", required: true, semanticType: "text" }],
    outputs: [
        { id: "score", label: "Score", type: "text", semanticType: "text" },
        { id: "passed", label: "Passed", type: "any", semanticType: "text" },
        { id: "feedback", label: "Feedback", type: "text", semanticType: "text" },
        { id: "output_text", label: "Passed Text", type: "text", semanticType: "text" },
    ],
    async run(ctx, rawConfig) {
        console.log(`[qaNode] Inputs for run ${ctx.runId}:`, Object.keys(ctx.inputs));
        const config = QANodeConfig.parse(rawConfig);
        const inputText = (ctx.inputs["input_text"] || ctx.inputs["text"] || ctx.inputs["value"]);
        if (!inputText) {
            throw new Error(`[qaNode] Missing required input: input_text (runId=${ctx.runId}). Available inputs: ${Object.keys(ctx.inputs).join(', ')}`);
        }
        const upstreamConfidence = ctx.inputs["confidence"];
        if (upstreamConfidence !== undefined && upstreamConfidence > 0.92) {
            return {
                score: 9,
                passed: true,
                feedback: "Auto-passed: upstream confidence exceeded 0.92 threshold.",
                output_text: inputText,
                explanation: `Upstream confidence was ${(upstreamConfidence * 100).toFixed(0)}% — above the 92% auto-pass threshold. Skipped full QA evaluation.`,
                confidence: upstreamConfidence,
            };
        }
        const systemPrompt = `You are a strict QA Evaluator.
Your task is to evaluate the provided text against this rubric:
"${config.rubric}"

You MUST output ONLY valid JSON in the following format, with no markdown formatting:
{
  "score": <number exactly between 0 and 10>,
  "issues": ["<specific issue 1>", "<specific issue 2>"],
  "confidence": <number between 0.0 and 1.0 indicating your certainty>
}
`;
        console.log(`[qaNode] Running schema-enforced evaluation via ${config.model}`);
        const validate = (raw) => {
            try {
                const parsed = JSON.parse(raw);
                const result = QAOutputSchema.safeParse(parsed);
                if (result.success)
                    return { success: true, data: result.data };
                return { success: false, error: result.error.message };
            }
            catch (e) {
                return { success: false, error: e.message };
            }
        };
        const { data: evaluationResult, attempts } = await (0, tools_1.callNimStructured)(inputText, {
            model: config.model,
            systemPrompt,
            maxTokens: 500,
            temperature: 0.1,
        }, ctx, validate);
        console.log(`[qaNode] Schema-validated output in ${attempts} attempt(s): score=${evaluationResult.score}`);
        const passed = evaluationResult.score >= config.threshold;
        if (!passed) {
            throw new Error(JSON.stringify({
                type: "QA_FAILED",
                message: `QA Failed with Score: ${evaluationResult.score}/10 (Min required: ${config.threshold}).`,
                feedback: evaluationResult.issues,
                score: evaluationResult.score,
            }));
        }
        return {
            score: evaluationResult.score,
            passed,
            feedback: evaluationResult.issues.join(", "),
            output_text: inputText,
            explanation: `Evaluated against QA rubric via ${config.model}: Score: ${evaluationResult.score}/10 (Threshold: ${config.threshold}) — ${passed ? "PASSED ✅" : "FAILED ❌"}. (Schema validated in ${attempts} attempt(s))`,
            confidence: evaluationResult.confidence,
        };
    },
};
//# sourceMappingURL=qa.js.map