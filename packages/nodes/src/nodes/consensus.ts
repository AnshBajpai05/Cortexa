import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { tools, callNimStructured } from "../tools";

// ─── Config Schema ────────────────────────────────────────────────────────────
const ConsensusNodeConfig = z.object({
  /** Model to use for the comparison — Kimi-K2 recommended for reasoning */
  model: z.string().default("moonshotai/kimi-k2-instruct"),
  /** Similarity threshold below which 'aligned' becomes false */
  threshold: z.number().min(0).max(1).default(0.8),
});

// ─── Output Schema ────────────────────────────────────────────────────────────
const ConsensusOutputSchema = z.object({
  consensus_score: z.number().min(0).max(1),
  aligned: z.boolean(),
  points_of_conflict: z.array(z.string()),
  explanation: z.string(),
});

type ConsensusOutput = z.infer<typeof ConsensusOutputSchema>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const consensusNode: NodeManifest = {
  id: "logic.consensus",
  name: "Consensus Detector",
  description:
    "Compares two agent outputs (Analyst vs Executive) and detects specific points of conflict or perspective variance.",
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

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = ConsensusNodeConfig.parse(rawConfig);
    const inputA = ctx.inputs["input_a"] as string;
    const inputB = ctx.inputs["input_b"] as string;

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

    const validate = (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        const result = ConsensusOutputSchema.safeParse(parsed);
        if (result.success) return { success: true as const, data: result.data };
        return { success: false as const, error: result.error.message };
      } catch (e: any) {
        return { success: false as const, error: e.message };
      }
    };

    const { data: result } = await callNimStructured<ConsensusOutput>(
      userMessage,
      {
        model: config.model,
        systemPrompt,
        maxTokens: 1000,
        temperature: 0.1,
      },
      ctx,
      validate
    );

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
