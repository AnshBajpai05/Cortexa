import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { tools, callNimStructured } from "../tools";

// ─── Config Schema ────────────────────────────────────────────────────────────
const AdversaryNodeConfig = z.object({
  model: z.string().default("moonshotai/kimi-k2-instruct"),
  type: z.enum(["general", "legal", "economic", "technical"]).default("general"),
  role: z.string().optional(),
  focus_area: z.string().optional(),
});

// ─── Output Schema ────────────────────────────────────────────────────────────
const AdversaryOutputSchema = z.object({
  attack_points: z.array(z.string()),
  severity: z.number().min(0).max(1),
  attack_type: z.enum(["logical_gap", "assumption_risk", "missing_data", "contradiction"]),
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
});

type AdversaryOutput = z.infer<typeof AdversaryOutputSchema>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const adversaryNode: NodeManifest = {
  id: "logic.adversary",
  name: "Adversary (Devil's Advocate)",
  description: "Explicitly attacks the combined reasoning of upstream nodes to break fragile assumptions.",
  category: "logic",

  costTier: "medium",
  avgLatencyMs: 4000,
  inputs: [
    { id: "context", label: "Aggregated Context to Attack", type: "text", required: true, semanticType: "text" },
  ],

  outputs: [
    { id: "attack_report", label: "Attack Report", type: "json", semanticType: "json" },
    { id: "severity", label: "Attack Severity", type: "text", semanticType: "text" },
  ],

  configSchema: AdversaryNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = AdversaryNodeConfig.parse(rawConfig);
    const context = ctx.inputs["context"] as string;

    if (!context) {
      throw new Error(`[logic.adversary] Missing context to attack.`);
    }

    const roles = {
      general: "Skeptical Devil's Advocate",
      legal: "Aggressive Regulatory Litigator",
      economic: "Hard-Nosed Short-Seller / VC Auditor",
      technical: "Pessimistic Security Architect & Systems Auditor",
    };

    const focusAreas = {
      general: "General logic and ungrounded assumptions",
      legal: "Regulatory liability, bar ethics, and malpractice exposure",
      economic: "CAC/LTV math, market saturation, and competitive moats",
      technical: "Hallucination rates, latency, token costs, and security vulnerabilities",
    };

    const role = config.role || roles[config.type];
    const focus = config.focus_area || focusAreas[config.type];

    const systemPrompt = `You are a ${role}.
Your sole purpose is to destroy the reasoning presented to you from a ${config.type.toUpperCase()} perspective. Do NOT be polite.
Focus on: ${focus}

Your goal is to find logical fallacies, ungrounded assumptions, conflicting incentives, and missing data in the provided context.

You MUST output ONLY valid JSON in this format:
{
  "attack_points": ["Specific, devastating critique 1", "Critique 2"],
  "severity": <float 0-1, 1 being completely destroyed logic>,
  "attack_type": "logical_gap" | "assumption_risk" | "missing_data" | "contradiction",
  "confidence": <float 0-1>,
  "explanation": "A one-sentence summary of why this reasoning fails."
}`;

    const userMessage = `Context to Attack:\n${context}`;

    const validate = (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        const result = AdversaryOutputSchema.safeParse(parsed);
        if (result.success) return { success: true as const, data: result.data };
        return { success: false as const, error: result.error.message };
      } catch (e: any) {
        return { success: false as const, error: e.message };
      }
    };

    const { data: result } = await callNimStructured<AdversaryOutput>(
      userMessage,
      {
        model: config.model,
        systemPrompt,
        maxTokens: 1000,
        temperature: 0.5, // Slightly higher temp for creative attacks
      },
      ctx,
      validate
    );

    return {
      value: `Severity: ${result.severity} | Type: ${result.attack_type}`,
      attack_report: result,
      severity: result.severity,
      label: `Adversary: ${result.attack_type} (Sev: ${result.severity})`,
      confidence: result.confidence,
    };
  },
};
