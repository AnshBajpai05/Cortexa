import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { callNimStructured } from "../tools";

// ─── Config Schema ────────────────────────────────────────────────────────────
const QANodeConfig = z.object({
  /** Model to use for evaluation — GLM-4.7 excels at structured JSON output */
  model: z
    .enum(["z-ai/glm4.7", "moonshotai/kimi-k2-instruct", "meta/llama-3.1-8b-instruct"])
    .default("z-ai/glm4.7"),
  /** The rubric or criteria to evaluate the input against */
  rubric: z.string().default("Check if the text is polite, professional, and accurate."),
  /** Threshold score required to pass (0 to 10) */
  threshold: z.number().min(0).max(10).default(7),
});

export type QANodeConfigType = z.infer<typeof QANodeConfig>;

// ─── Enforced Output Schema ───────────────────────────────────────────────────
const QAOutputSchema = z.object({
  score: z.number().min(0).max(10),
  issues: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

type QAOutput = z.infer<typeof QAOutputSchema>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const qaNode: NodeManifest = {
  id: "logic.qa-evaluator",
  name: "QA Evaluator",
  description:
    "Evaluates text against a rubric using GLM-4.7 with schema-enforced structured output. Fails the pipeline if the score is too low, triggering the self-correction loop.",
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

  async run(ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> {
    console.log(`[qaNode] Inputs for run ${ctx.runId}:`, Object.keys(ctx.inputs));
    const config = QANodeConfig.parse(rawConfig);
    const inputText = (ctx.inputs["input_text"] || ctx.inputs["text"] || ctx.inputs["value"]) as string;

    if (!inputText) {
      throw new Error(`[qaNode] Missing required input: input_text (runId=${ctx.runId}). Available inputs: ${Object.keys(ctx.inputs).join(', ')}`);
    }

    // ── Confidence-Based Fast-Pass ─────────────────────────────────────────────
    const upstreamConfidence = ctx.inputs["confidence"] as number | undefined;
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

    // ── Schema-Enforced Structured Output ──────────────────────────────────────
    console.log(`[qaNode] Running schema-enforced evaluation via ${config.model}`);

    const validate = (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        const result = QAOutputSchema.safeParse(parsed);
        if (result.success) return { success: true as const, data: result.data };
        return { success: false as const, error: result.error.message };
      } catch (e: any) {
        return { success: false as const, error: e.message };
      }
    };

    const { data: evaluationResult, attempts } = await callNimStructured<QAOutput>(
      inputText,
      {
        model: config.model,
        systemPrompt,
        maxTokens: 500,
        temperature: 0.1,
      },
      ctx,
      validate,
    );

    console.log(`[qaNode] Schema-validated output in ${attempts} attempt(s): score=${evaluationResult.score}`);

    const passed = evaluationResult.score >= config.threshold;

    if (!passed) {
      // Self-correcting pipeline — throw structured error so the engine can retry
      throw new Error(
        JSON.stringify({
          type: "QA_FAILED",
          message: `QA Failed with Score: ${evaluationResult.score}/10 (Min required: ${config.threshold}).`,
          feedback: evaluationResult.issues,
          score: evaluationResult.score,
        })
      );
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
