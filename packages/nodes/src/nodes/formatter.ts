import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { callNimStructured } from "../tools";

// ─── Config Schema ────────────────────────────────────────────────────────────
const FormatterNodeConfig = z.object({
  model: z.string().default("meta/llama-3.1-8b-instruct"),
});

// ─── Output Schema ────────────────────────────────────────────────────────────
const FormatterOutputSchema = z.object({
  decision: z.enum(["GO", "NO_GO", "CONDITIONAL_GO", "PIVOT", "UNKNOWN"]),
  reasoning: z.array(z.string()),
  risks: z.array(z.string()),
  confidence: z.number(),
  notes: z.string().optional().default(""),
});

type FormatterOutput = z.infer<typeof FormatterOutputSchema>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const formatterNode: NodeManifest = {
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
    { id: "context", label: "Context String", type: "text", semanticType: "text" }, // for visual prompter
  ],

  configSchema: FormatterNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = FormatterNodeConfig.parse(rawConfig);
    const resolverOutput = ctx.inputs["resolver_output"] as string;

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

    const validate = (raw: string) => {
      try {
        const parsed = JSON.parse(raw);
        const result = FormatterOutputSchema.safeParse(parsed);
        if (result.success) return { success: true as const, data: result.data };
        return { success: false as const, error: result.error.message };
      } catch (e: any) {
        return { success: false as const, error: e.message };
      }
    };

    let result: FormatterOutput;
    let parseStatus: "success" | "fallback" = "success";

    try {
      const { data } = await callNimStructured<FormatterOutput>(
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
      result = data;
    } catch (e: any) {
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

    // --- Validation Clamping & Edge Case Fixes ---
    
    // 1. Clamp confidence between 0 and 1
    result.confidence = Math.max(0, Math.min(1, result.confidence));
    
    // 2. Prevent empty arrays for reasoning
    if (!result.reasoning || result.reasoning.length === 0) {
      result.reasoning = ["No reasoning provided"];
    }

    // 3. Prepare the combined context string for downstream nodes
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
