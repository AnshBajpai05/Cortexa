import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";

// ─── Config Schema ────────────────────────────────────────────────────────────
const RecallNodeConfig = z.object({
  key: z.string().describe("The key to recall from memory (e.g. 'legal_ai_2026_decision')"),
  injectAs: z.enum(["context", "rules"]).default("context"),
});

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const recallNode: NodeManifest = {
  id: "memory.recall",
  name: "Memory Recall",
  description: "Retrieves historical decisions from memory to enable cross-run learning and adaptation.",
  category: "logic",

  costTier: "low",
  avgLatencyMs: 1000,
  inputs: [],

  outputs: [
    { id: "historical_context", label: "Historical Context", type: "text", semanticType: "text" },
    { id: "memory_value", label: "Raw Memory Value", type: "json", semanticType: "json" },
  ],

  configSchema: RecallNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = RecallNodeConfig.parse(rawConfig);
    const apiUrl = ctx.env.API_URL;
    const workflowId = ctx.workflowId;

    // Fetch memory from API
    const res = await fetch(`${apiUrl}/workflows/${workflowId}/memory`);
    if (!res.ok) {
      throw new Error(`[memory.recall] Failed to fetch memories: ${await res.text()}`);
    }

    const memories = await res.json() as any[];
    const target = memories.find(m => m.key === config.key);

    if (!target) {
      return {
        value: "NO_HISTORY",
        historical_context: "No historical record found for this task. Proceeding with fresh analysis.",
        label: `Recall: Not Found (${config.key})`,
        confidence: 0,
      };
    }

    const value = target.value;
    let contextBlock = "";
    
    if (config.injectAs === "context") {
      contextBlock = `
### HISTORICAL CONTEXT & CONSTRAINTS
In a previous run for this task, the system reached the following decision:
"${value}"

You MUST respect any constraints or pivots identified in this history to ensure consistency and continuous learning.
`;
    }

    return {
      value: value,
      historical_context: contextBlock,
      memory_value: value,
      label: `Recalled: ${config.key}`,
      explanation: `Successfully recalled historical context from memory key '${config.key}'.`,
      confidence: 1,
    };
  },
};
