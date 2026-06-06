"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractFlow = extractFlow;
const tools_1 = require("../tools");
const EXTRACT_PROMPT = `Extract the system architecture as a Mermaid.js flowchart from the following text.
Return ONLY valid JSON matching this structure:
{
  "mermaid_code": "graph TD;\\n  A[Input] --> B[Process];\\n"
}

HARD RULES:
1. ONLY return valid Mermaid JS code inside the "mermaid_code" string property.
2. Ensure you use 'graph TD' (top-down) or 'graph LR' (left-right).
3. Use clearly labeled nodes (e.g., A[User Input]).
4. If there are groups or layers, use 'subgraph' to group related nodes logically.
5. Max 15 nodes. Keep it clean, professional, and properly structured. Do not simplify the critical logic flow.
6. The mermaid_code string must be properly escaped for JSON.

Text Context:
`;
async function extractFlow(text, ctx) {
    console.log(`[flowExtractor] Extracting mermaid flow from text (${text.length} chars)`);
    try {
        const result = await (0, tools_1.callNimStructured)(EXTRACT_PROMPT + text.slice(0, 8000), {
            task: "agent",
            preference: "quality",
            temperature: 0.1,
            maxTokens: 2048,
        }, ctx, (raw) => {
            try {
                const parsed = JSON.parse(raw);
                if (typeof parsed.mermaid_code === "string" && parsed.mermaid_code.includes("graph")) {
                    return { success: true, data: parsed };
                }
                return { success: false, error: "Missing required 'mermaid_code' string." };
            }
            catch (e) {
                return { success: false, error: e.message };
            }
        }, 1);
        const graph = result.data;
        if (!graph || !graph.mermaid_code) {
            console.warn(`[flowExtractor] Extracted graph is empty. Skipping diagram generation.`);
            return null;
        }
        return graph;
    }
    catch (err) {
        console.error(`[flowExtractor] Extraction failed:`, err.message);
        return null;
    }
}
//# sourceMappingURL=flowExtractor.js.map