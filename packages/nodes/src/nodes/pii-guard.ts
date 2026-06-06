import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";

// ─── Config Schema ────────────────────────────────────────────────────────────
const PII_TYPES = ["email", "phone", "ssn", "credit_card", "ip", "api_key"] as const;
type PiiType = (typeof PII_TYPES)[number];

const PiiGuardNodeConfig = z.object({
  /** Which PII categories to scan for */
  types: z.array(z.enum(PII_TYPES)).default([...PII_TYPES]),
  /** mask = redact in place; block = throw structured error; report = pass through, just flag */
  action: z.enum(["mask", "block", "report"]).default("mask"),
});

export type PiiGuardNodeConfigType = z.infer<typeof PiiGuardNodeConfig>;

// ─── Detection patterns ───────────────────────────────────────────────────────
const PATTERNS: Record<PiiType, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
  ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  api_key: /\b(?:sk|nvapi|gsk|hf|pk|AKIA|ghp|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/g,
};

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const piiGuardNode: NodeManifest = {
  id: "safety.pii-guard",
  name: "PII Guard",
  description:
    "Deterministic PII guardrail (no LLM, free, instant). Scans text for emails, phones, SSNs, credit cards, IPs, and API keys; then masks, blocks, or reports. Closes the Guardrails/PII-masking gap from the AgentKit spec. Put before any export/output node.",
  category: "safety",

  costTier: "low",
  avgLatencyMs: 20,
  inputs: [
    { id: "text", label: "Text to Scan", type: "text", required: true },
  ],

  outputs: [
    { id: "text", label: "Sanitized Text", type: "text", semanticType: "text" },
    { id: "findings", label: "Findings (JSON)", type: "json", semanticType: "json" },
    { id: "clean", label: "Clean (boolean)", type: "text", semanticType: "decision" },
  ],

  configSchema: PiiGuardNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = PiiGuardNodeConfig.parse(rawConfig);

    const text = (ctx.inputs["text"] ||
      ctx.inputs["value"] ||
      ctx.inputs["output_text"]) as string;

    if (text === undefined || text === null) {
      throw new Error(
        `[piiGuardNode] Missing required input: text (runId=${ctx.runId}). Available: ${Object.keys(ctx.inputs).join(", ")}`
      );
    }

    const src = String(text);
    const activeSet = new Set(config.types.length ? config.types : [...PII_TYPES]);
    // Specific → generic. Redact structured tokens (keys, cards, ssn) BEFORE the
    // greedy digit patterns (phone/ip) so they don't cannibalise key/card digits.
    const ORDER: PiiType[] = ["api_key", "credit_card", "ssn", "email", "ip", "phone"];
    const findings: { type: PiiType; count: number; samples: string[] }[] = [];
    let sanitized = src;

    for (const type of ORDER) {
      if (!activeSet.has(type)) continue;
      // Detect against the CURRENT sanitized text so already-redacted spans
      // (e.g. [REDACTED:api_key]) can't be re-matched by a later pattern.
      const matches = sanitized.match(PATTERNS[type]);
      if (matches && matches.length) {
        findings.push({
          type,
          count: matches.length,
          // mask samples so we never echo the raw PII back
          samples: [...new Set(matches)].slice(0, 3).map((m) => `${m.slice(0, 2)}***`),
        });
        if (config.action === "mask") {
          sanitized = sanitized.replace(PATTERNS[type], `[REDACTED:${type}]`);
        }
      }
    }

    const totalHits = findings.reduce((n, f) => n + f.count, 0);
    const clean = totalHits === 0;

    if (config.action === "block" && !clean) {
      throw new Error(
        JSON.stringify({
          type: "SAFETY_BLOCKED",
          category: "pii",
          message: `PII Guard blocked output: found ${totalHits} PII item(s) — ${findings.map((f) => `${f.count}× ${f.type}`).join(", ")}. Rewrite without personal data.`,
        })
      );
    }

    const outText = config.action === "mask" ? sanitized : src;

    return {
      value: outText,
      text: outText,
      findings,
      clean,
      label: clean ? "PII Guard: clean ✓" : `PII Guard: ${totalHits} item(s) ${config.action === "mask" ? "redacted" : "flagged"}`,
      explanation: clean
        ? `No PII detected across ${activeSet.size} categories.`
        : `Found ${totalHits} PII item(s): ${findings.map((f) => `${f.count}× ${f.type}`).join(", ")}. Action: ${config.action}.`,
      confidence: 0.99,
    };
  },
};
