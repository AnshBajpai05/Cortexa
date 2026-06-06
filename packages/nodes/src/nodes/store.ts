import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";

// ─── Config Schema ────────────────────────────────────────────────────────────
const StoreNodeConfig = z.object({
  type: z.enum(["context", "history"]).default("history"),
  key: z.string().describe("The key to store this value under (e.g. 'final_decision_2026')"),
});

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const storeNode: NodeManifest = {
  id: "memory.store",
  name: "Memory Store",
  description: "Saves the input into the long-term memory system for retrieval in future runs.",
  category: "logic",

  costTier: "low",
  avgLatencyMs: 500,
  inputs: [
    { id: "value_to_store", label: "Value to Store", type: "text", required: true, semanticType: "text" },
  ],

  outputs: [
    { id: "status", label: "Store Status", type: "text", semanticType: "text" },
  ],

  configSchema: StoreNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = StoreNodeConfig.parse(rawConfig);
    const value = ctx.inputs["value_to_store"] as string;

    if (!value) {
      throw new Error(`[memory.store] Missing value to store.`);
    }

    const apiUrl = ctx.env.API_URL;
    const workflowId = ctx.workflowId;

    // Call the API to create the memory record
    const res = await fetch(`${apiUrl}/workflows/${workflowId}/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: config.type,
        key: config.key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`[memory.store] Failed to save memory: ${err}`);
    }

    return {
      value: "SUCCESS",
      status: "SUCCESS",
      label: `Stored: ${config.key}`,
      explanation: `Successfully stored memory of type '${config.type}' under key '${config.key}'.`,
    };
  },
};
