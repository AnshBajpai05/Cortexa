import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { tools, callNimStructured } from "../tools";
import { MODELS } from "../models.config";

// ─── Config Schema ────────────────────────────────────────────────────────────
const TextNodeConfig = z.object({
  /** System prompt injected before user input */
  systemPrompt: z.string().default("You are a helpful assistant."),
  /**
   * NVIDIA NIM model id. Accepts any current catalog id (verify at
   * https://build.nvidia.com/models) so a model deprecation never breaks
   * saved workflows. Leave unset to use the centrally-configured reasoning
   * model (see models.config.ts). Recommended ids:
   *   • moonshotai/kimi-k2-instruct   — heavy reasoning / complex tasks
   *   • meta/llama-3.3-70b-instruct   — high-fidelity reasoning / agentic
   *   • meta/llama-3.1-8b-instruct    — blazing-fast fallback / tight loops
   */
  model: z.string().min(1).default(MODELS.reasoning),
  /** Max tokens for the response */
  maxTokens: z.number().int().min(1).max(8192).default(1024),
  /** Temperature — 0 = deterministic, 1 = creative */
  temperature: z.number().min(0).max(1).default(0.7),
  /** Agent role (optional) */
  role: z.string().optional(),
  /** Agent goal (optional) */
  goal: z.string().optional(),
  /** Key to save the generated text to workflow memory */
  saveToMemoryKey: z.string().optional(),
  /** Grounding mode: 'hard' (fail if no context), 'soft' (warn), 'none' (default) */
  requireContext: z.enum(["hard", "soft", "none"]).default("none"),
  /** Optional JSON Schema string to enforce typed output contracts */
  jsonSchema: z.string().optional(),
  /** Static prompt fallback */
  prompt: z.string().optional(),
});

export type TextNodeConfigType = z.infer<typeof TextNodeConfig>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const textNode: NodeManifest = {
  id: "text.run-any-llm",
  name: "LLM Text Generator",
  description:
    "Calls NVIDIA NIM inference with support for grounding enforcement and typed JSON contracts.",
  category: "text",

  costTier: "medium",
  avgLatencyMs: 3000,
  inputs: [
    {
      id: "prompt",
      label: "Prompt",
      type: "text",
      required: true,
    },
    {
      id: "context",
      label: "Context (optional)",
      type: "text",
      required: false,
    },
    {
      id: "historical_context",
      label: "Historical Context (optional)",
      type: "text",
      required: false,
    },
  ],

  outputs: [
    {
      id: "text",
      label: "Generated Text",
      type: "text",
    },
    {
      id: "structuredData",
      label: "Structured JSON",
      type: "json",
    },
    // Common Marketing Handles (for dynamic structured output)
    { id: "headline", label: "Headline", type: "text" },
    { id: "tagline", label: "Tagline", type: "text" },
    { id: "call_to_action", label: "Call to Action", type: "text" },
  ],

  configSchema: TextNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = TextNodeConfig.parse(rawConfig);

    const prompt = (ctx.inputs["prompt"] ||
      ctx.inputs["text"] ||
      ctx.inputs["output_text"] ||
      ctx.inputs["value"] ||
      config.prompt) as string;
    const context = ctx.inputs["context"] as string | undefined;
    const memoryContext = ctx.inputs["workspace_context"] as string | undefined;

    if (!prompt) {
      throw new Error(
        `[textNode] Missing required input: prompt (runId=${ctx.runId}). Available: ${Object.keys(
          ctx.inputs
        ).join(", ")}`
      );
    }

    // ── Phase 1: Grounding Enforcement ───────────────────────────────────────
    const hasContext = !!(context || memoryContext);
    if (config.requireContext === "hard" && !hasContext) {
      throw new Error(
        JSON.stringify({
          type: "UNGROUNDED_EXECUTION",
          message: `Grounding failed: Node "${ctx.nodeId}" requires context but none was provided. Hallucination risk too high.`,
        })
      );
    }
    const groundingConfidenceModifier =
      !hasContext && config.requireContext === "soft" ? 0.3 : 0;

    // Phase 3.1: Agent Roles — inject role/goal into system prompt if provided
    let systemPrompt = config.systemPrompt;
    if (config.role) {
      systemPrompt = `You are a ${config.role}.\nYour goal: ${
        config.goal || "Follow instructions strictly."
      }\n${systemPrompt}`;
    }

    const historicalContext = ctx.inputs["historical_context"] as string | undefined;

    let userMessage = context
      ? `Context:\n${context}\n\nTask:\n${prompt}`
      : prompt;

    if (historicalContext) {
      userMessage = `${historicalContext}\n\n---\n\n${userMessage}`;
    }

    // Phase 3.3: Memory Layer Injection
    if (memoryContext) {
      userMessage = `System Memory / Brand Context:\n${memoryContext}\n\n---\n\n${userMessage}`;
    }

    // Phase 3.2: Self-Correction Loop Feedback
    const qaFeedback = ctx.inputs["qa_feedback"];
    if (qaFeedback) {
      let issuesText = "";
      if (Array.isArray(qaFeedback)) {
        issuesText = qaFeedback.map((issue: string) => `- ${issue}`).join("\n");
      } else {
        issuesText = String(qaFeedback);
      }
      userMessage += `\n\n[URGENT] Your previous attempt failed Quality Assurance.\nSpecific issues to fix:\n${issuesText}\n\nPlease rewrite and fix these exact issues.`;
    }

    let text: string;
    let confidence: number;
    let structuredData: any = null;

    // ── Phase 2: Generation (Typed vs Raw) ────────────────────────────────────
    if (config.jsonSchema) {
      // TYPED CONTRACT MODE
      const structuredSystemPrompt = `${systemPrompt}\n\n[STRICT_JSON MODE]\nYou MUST output ONLY valid, minified JSON matching the required schema. \n- NO markdown code fences (e.g. \`\`\`json).\n- NO conversational text or explanations.\n- NO leading/trailing text.\n- FAILURE TO OUTPUT ONLY JSON WILL BREAK THE PIPELINE.\n- SCHEMA: ${config.jsonSchema}`;

      const validate = (raw: string) => {
        try {
          const parsed = JSON.parse(raw);
          return { success: true as const, data: parsed };
        } catch (e: any) {
          return { success: false as const, error: e.message };
        }
      };

      const { data } = await callNimStructured<any>(
        userMessage,
        {
          model: config.model,
          systemPrompt: structuredSystemPrompt,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
        },
        ctx,
        validate
      );

      structuredData = data;
      text = typeof data === "string" ? data : JSON.stringify(data);
      confidence = data.confidence ?? 0.92;
    } else {
      // RAW TEXT MODE
      text = await tools.llm(
        "nvidia",
        userMessage,
        {
          model: config.model,
          systemPrompt,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
        },
        ctx
      );
      // Dynamic confidence heuristic
      const len = text.length;
      confidence = Math.min(0.98, Math.max(0.3, 0.5 + (len / 2000) * 0.4));
    }

    // Apply grounding penalty if soft
    confidence = Math.max(0.1, confidence - groundingConfidenceModifier);

    // Optional: Save to memory for reuse
    if (config.saveToMemoryKey && text) {
      try {
        const memoryPayload = {
          type: config.jsonSchema ? "json" : "text",
          key: config.saveToMemoryKey,
          value: text,
        };
        const apiUrl = (ctx.env as any).API_URL || "http://localhost:3001/api";
        await fetch(`${apiUrl}/workflows/${ctx.workflowId}/memory`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(memoryPayload),
        });
        console.log(
          `[textNode] Saved to memory with key: ${config.saveToMemoryKey}`
        );
      } catch (err: any) {
        console.error(`[textNode] Failed to save memory: ${err.message}`);
      }
    }

    return {
      value: text,
      text,
      label: config.jsonSchema 
        ? `${(structuredData as any).headline || (structuredData as any).title || text.slice(0, 30)}…` 
        : text.slice(0, 40) + "…",
      explanation: config.jsonSchema
        ? `Generated structured response via ${config.model} as ${config.role || "Analyst"}. Grounding: ${config.requireContext || "none"}.`
        : `Generated ${text.length} characters of reasoning via ${config.model}.`,
      confidence: confidence,
      groundingMode: config.requireContext || "none",
      structuredData,
      ...(config.jsonSchema ? structuredData : {}), // FLAT-MAP HERE
    };
  },
};
