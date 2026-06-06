import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { tools } from "../tools";

// ─── Config Schema ────────────────────────────────────────────────────────────
const SafetyNodeConfig = z.object({
  /** What to do when content is classified as Unsafe */
  failOnUnsafe: z.boolean().default(true),
  /** Optional label for what is being checked */
  checkLabel: z.string().optional(),
});

export type SafetyNodeConfigType = z.infer<typeof SafetyNodeConfig>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const safetyNode: NodeManifest = {
  id: "safety.llama-guard",
  name: "Safety Guard",
  description:
    "Classifies input/output content as Safe or Unsafe using meta/llama-guard-4-12b. Optionally blocks the pipeline on unsafe content.",
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

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = SafetyNodeConfig.parse(rawConfig);
    const content = ctx.inputs["content"];

    if (content === undefined || content === null) {
      throw new Error(`[safetyNode] Missing required input: content (runId=${ctx.runId})`);
    }

    const contentString =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);

    const label = config.checkLabel ?? "content";
    console.log(`[safetyNode] Running Llama Guard 4 on ${label} (${contentString.length} chars)...`);

    const verdict = await tools.safety(contentString, ctx);

    if (!verdict.safe && config.failOnUnsafe) {
      // Throw a structured error so the self-correction loop can react
      throw new Error(
        JSON.stringify({
          type: "SAFETY_BLOCKED",
          message: `Content classified as UNSAFE by Llama Guard 4.`,
          category: verdict.category,
          raw: verdict.raw,
        })
      );
    }

    return {
      value: verdict.safe,
      safe: verdict.safe,
      category: verdict.category,
      content_passthrough: verdict.safe ? content : null,
      raw_verdict: verdict.raw,
      label: verdict.safe ? "✅ Safe" : `⛔ Unsafe (${verdict.category})`,
      explanation: `Llama Guard 4 classified ${label} as "${verdict.safe ? "SAFE" : "UNSAFE"}". ${
        verdict.safe ? "Content passes safety layer." : `Violation category: ${verdict.category}.`
      }`,
      confidence: 0.99, // Llama Guard is a dedicated classifier — very high confidence
    };
  },
};
