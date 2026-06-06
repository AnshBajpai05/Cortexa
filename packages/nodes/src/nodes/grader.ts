import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { callNimStructured } from "../tools";
import { MODELS } from "../models.config";

// ─── Config Schema ────────────────────────────────────────────────────────────
// Mirrors the inspiration's grader spec: Tone, ClaimRisk, SourceCoverage, Readability.
const GRADERS = ["tone", "claim_risk", "source_coverage", "readability"] as const;
type Grader = (typeof GRADERS)[number];

const GraderNodeConfig = z.object({
  /** Which graders to run (default all 4) */
  graders: z.array(z.enum(GRADERS)).default([...GRADERS]),
  /** Pass threshold for overall score (0-10) */
  threshold: z.number().min(0).max(10).default(7),
  /** Optional explicit model; defaults to central reasoning model */
  model: z.string().optional(),
  /** House-style / rubric notes injected into the judge prompt */
  rubric: z.string().optional(),
});

export type GraderNodeConfigType = z.infer<typeof GraderNodeConfig>;

interface GraderScore {
  score: number;
  reason: string;
}
interface GraderResult {
  tone?: GraderScore;
  claim_risk?: GraderScore;
  source_coverage?: GraderScore;
  readability?: GraderScore;
  issues: string[];
}

const GRADER_DESCRIPTIONS: Record<Grader, string> = {
  tone: "tone (0=off-brand/inappropriate, 10=perfectly on-brand and appropriate)",
  claim_risk: "claim_risk (0=no unsupported/risky claims, 10=many unsupported or risky claims) — LOWER IS BETTER",
  source_coverage: "source_coverage (0=claims not backed by provided sources, 10=every claim grounded in sources)",
  readability: "readability (0=confusing/dense, 10=clear and well-structured)",
};

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const graderNode: NodeManifest = {
  id: "logic.grader",
  name: "Eval Graders",
  description:
    "LLM-as-judge evaluation. Scores text on Tone, ClaimRisk, SourceCoverage, Readability (0-10) with rationale, computes a pass/fail vs threshold, and emits structured qa_feedback that plugs straight into the self-correction loop. Free — runs on the same NIM models.",
  category: "logic",

  costTier: "medium",
  avgLatencyMs: 3000,
  inputs: [
    { id: "text", label: "Text to Evaluate", type: "text", required: true },
    { id: "sources", label: "Sources / Context (optional)", type: "text", required: false },
  ],

  outputs: [
    { id: "scores", label: "Per-grader Scores (JSON)", type: "json", semanticType: "json" },
    { id: "overall", label: "Overall Score (0-10)", type: "text", semanticType: "text" },
    { id: "passed", label: "Passed (boolean)", type: "text", semanticType: "decision" },
    { id: "qa_feedback", label: "Issues (feeds self-correction)", type: "json", semanticType: "json" },
  ],

  configSchema: GraderNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = GraderNodeConfig.parse(rawConfig);

    const text = (ctx.inputs["text"] ||
      ctx.inputs["value"] ||
      ctx.inputs["output_text"]) as string;
    const sources = (ctx.inputs["sources"] ||
      ctx.inputs["context"] ||
      "") as string;

    if (!text) {
      throw new Error(
        `[graderNode] Missing required input: text (runId=${ctx.runId}). Available: ${Object.keys(ctx.inputs).join(", ")}`
      );
    }

    const active = config.graders.length ? config.graders : [...GRADERS];
    const dimensionList = active.map((g) => `- ${GRADER_DESCRIPTIONS[g]}`).join("\n");

    const schemaShape = active
      .map((g) => `"${g}": { "score": <0-10>, "reason": "<one sentence>" }`)
      .join(",\n  ");

    const systemPrompt =
      "You are a strict, fair evaluation judge. Score the TEXT on each dimension from 0 to 10. " +
      "Be specific and concise. Return ONLY JSON." +
      (config.rubric ? `\n\nHouse rubric:\n${config.rubric}` : "");

    const userPrompt =
      `Evaluate the following TEXT on these dimensions:\n${dimensionList}\n\n` +
      (sources ? `SOURCES (use to judge source_coverage and claim_risk):\n${sources}\n\n` : "") +
      `TEXT:\n${text}\n\n` +
      `Return JSON exactly shaped:\n{\n  ${schemaShape},\n  "issues": ["<actionable fix>", ...]\n}`;

    const validate = (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed !== "object" || parsed === null) {
          return { success: false as const, error: "not an object" };
        }
        return { success: true as const, data: parsed as GraderResult };
      } catch (e: any) {
        return { success: false as const, error: e.message };
      }
    };

    const { data } = await callNimStructured<GraderResult>(
      userPrompt,
      {
        model: config.model || MODELS.reasoning,
        systemPrompt,
        maxTokens: 1024,
        temperature: 0.2,
      },
      ctx,
      validate
    );

    // ── Compute overall (claim_risk is inverted: lower risk = higher quality) ──
    const parts: number[] = [];
    for (const g of active) {
      const s = (data as any)[g]?.score;
      if (typeof s === "number") {
        parts.push(g === "claim_risk" ? 10 - s : s);
      }
    }
    const overall = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 0;
    const passed = overall >= config.threshold;

    const issues = Array.isArray(data.issues) ? data.issues : [];

    return {
      value: { scores: data, overall, passed },
      scores: data,
      overall: overall.toFixed(2),
      passed,
      // Emit BOTH keys so this drops into the existing self-correction loop,
      // which looks for `qa_feedback` on the text node inputs.
      qa_feedback: issues,
      label: `Eval: ${overall.toFixed(1)}/10 ${passed ? "✓ PASS" : "✗ FAIL"}`,
      explanation: `Graded on ${active.join(", ")}. Overall ${overall.toFixed(2)}/10 vs threshold ${config.threshold}. ${issues.length} issue(s).`,
      confidence: Math.min(0.98, overall / 10),
    };
  },
};
