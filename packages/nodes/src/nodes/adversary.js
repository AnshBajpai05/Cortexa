"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adversaryNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const AdversaryNodeConfig = zod_1.z.object({
    model: zod_1.z.string().default("moonshotai/kimi-k2-instruct"),
    type: zod_1.z.enum(["general", "legal", "economic", "technical"]).default("general"),
    role: zod_1.z.string().optional(),
    focus_area: zod_1.z.string().optional(),
});
const AdversaryOutputSchema = zod_1.z.object({
    attack_points: zod_1.z.array(zod_1.z.string()),
    severity: zod_1.z.number().min(0).max(1),
    attack_type: zod_1.z.enum(["logical_gap", "assumption_risk", "missing_data", "contradiction"]),
    confidence: zod_1.z.number().min(0).max(1),
    explanation: zod_1.z.string(),
});
exports.adversaryNode = {
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
    run: async (ctx, rawConfig) => {
        const config = AdversaryNodeConfig.parse(rawConfig);
        const context = ctx.inputs["context"];
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
        const validate = (raw) => {
            try {
                const parsed = JSON.parse(raw);
                const result = AdversaryOutputSchema.safeParse(parsed);
                if (result.success)
                    return { success: true, data: result.data };
                return { success: false, error: result.error.message };
            }
            catch (e) {
                return { success: false, error: e.message };
            }
        };
        const { data: result } = await (0, tools_1.callNimStructured)(userMessage, {
            model: config.model,
            systemPrompt,
            maxTokens: 1000,
            temperature: 0.5,
        }, ctx, validate);
        return {
            value: `Severity: ${result.severity} | Type: ${result.attack_type}`,
            attack_report: result,
            severity: result.severity,
            label: `Adversary: ${result.attack_type} (Sev: ${result.severity})`,
            confidence: result.confidence,
        };
    },
};
//# sourceMappingURL=adversary.js.map