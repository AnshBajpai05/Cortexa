"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeNode = void 0;
const zod_1 = require("zod");
const StoreNodeConfig = zod_1.z.object({
    type: zod_1.z.enum(["context", "history"]).default("history"),
    key: zod_1.z.string().describe("The key to store this value under (e.g. 'final_decision_2026')"),
});
exports.storeNode = {
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
    run: async (ctx, rawConfig) => {
        const config = StoreNodeConfig.parse(rawConfig);
        const value = ctx.inputs["value_to_store"];
        if (!value) {
            throw new Error(`[memory.store] Missing value to store.`);
        }
        const apiUrl = ctx.env.API_URL;
        const workflowId = ctx.workflowId;
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
//# sourceMappingURL=store.js.map