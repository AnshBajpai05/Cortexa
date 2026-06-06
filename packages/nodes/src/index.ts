// ─── Public API ───────────────────────────────────────────────────────────────
// This is the single entry point for the @cortexa/nodes package.

export * from "./types";
export * from "./models.config";
export * from "./graph-validator";
export * from "./nodes/text";
export * from "./nodes/image";
export * from "./nodes/qa";
export * from "./nodes/orchestrator";
export * from "./nodes/global-evaluator";
export * from "./nodes/export";
export * from "./nodes/safety";
export * from "./nodes/ocr";
export * from "./nodes/rerank";
export * from "./nodes/retrieve";
export * from "./nodes/decision";
export * from "./nodes/consensus";
export * from "./nodes/resolver";
export * from "./nodes/formatter";
export * from "./nodes/validator";
export * from "./nodes/adversary";
export * from "./nodes/store";
export * from "./nodes/recall";
export * from "./nodes/web-search";
export * from "./nodes/grader";
export * from "./nodes/doc-ingest";
export * from "./nodes/pii-guard";

// ─── Node Registry ────────────────────────────────────────────────────────────
// Centralised map used by the Worker to look up node execution logic by ID
import { NodeManifest, NodeRegistry } from "./types";
import { textNode } from "./nodes/text";
import { imageNode } from "./nodes/image";
import { qaNode } from "./nodes/qa";
import { orchestratorNode } from "./nodes/orchestrator";
import { globalEvaluatorNode } from "./nodes/global-evaluator";
import { exportNode } from "./nodes/export";
import { exportPptNode } from "./nodes/export-ppt";
import { safetyNode } from "./nodes/safety";
import { ocrNode } from "./nodes/ocr";
import { rerankNode } from "./nodes/rerank";
import { retrieveNode } from "./nodes/retrieve";
import { decisionNode } from "./nodes/decision";
import { consensusNode } from "./nodes/consensus";
import { resolverNode } from "./nodes/resolver";
import { formatterNode } from "./nodes/formatter";
import { validatorNode } from "./nodes/validator";
import { adversaryNode } from "./nodes/adversary";
import { storeNode } from "./nodes/store";
import { recallNode } from "./nodes/recall";
import { webSearchNode } from "./nodes/web-search";
import { graderNode } from "./nodes/grader";
import { docIngestNode } from "./nodes/doc-ingest";
import { piiGuardNode } from "./nodes/pii-guard";

export const nodeRegistry: NodeRegistry = new Map<string, NodeManifest>([
  // ── Core generation ─────────────────────────────────────────────────────────
  [textNode.id, textNode],
  ["text", textNode], // Alias for easier lookups
  [imageNode.id, imageNode],
  ["image", imageNode], // Alias
  [exportNode.id, exportNode],
  ["output", exportNode], // Alias
  [exportPptNode.id, exportPptNode],
  ["export.ppt", exportPptNode], // Alias
  // ── Logic & control flow ────────────────────────────────────────────────────
  [orchestratorNode.id, orchestratorNode],
  [decisionNode.id, decisionNode],         // NEW: deep planning via Kimi-K2
  ["decision", decisionNode],              // Alias
  [consensusNode.id, consensusNode],       // NEW: alignment detection
  [resolverNode.id, resolverNode],         // NEW: conflict resolution
  [formatterNode.id, formatterNode],       // NEW: strict JSON formatter
  ["formatter", formatterNode],            // Alias
  [validatorNode.id, validatorNode],       // NEW: deterministic rule validation
  ["validator", validatorNode],            // Alias
  [adversaryNode.id, adversaryNode],       // NEW: devil's advocate / adversarial logic
  ["adversary", adversaryNode],            // Alias
  [qaNode.id, qaNode],
  ["logic", qaNode],                       // Alias
  [globalEvaluatorNode.id, globalEvaluatorNode],
  // ── Memory & RAG ────────────────────────────────────────────────────────────
  [retrieveNode.id, retrieveNode],         // NEW: semantic retrieval
  [rerankNode.id, rerankNode],             // NEW: nv-rerankqa reranking
  [storeNode.id, storeNode],               // NEW: memory persistence
  ["store", storeNode],                   // Alias
  [recallNode.id, recallNode],             // NEW: cross-run memory retrieval
  ["recall", recallNode],                  // Alias
  // ── Safety & Vision ─────────────────────────────────────────────────────────
  [safetyNode.id, safetyNode],
  ["safety", safetyNode],                  // Alias
  [ocrNode.id, ocrNode],
  // ── Tools ─────────────────────────────────────────────────────────────────
  [webSearchNode.id, webSearchNode],       // NEW: live web grounding (free tier)
  ["web.search", webSearchNode],           // Alias
  ["websearch", webSearchNode],            // Alias
  // ── Evals ───────────────────────────────────────────────────────────────────
  [graderNode.id, graderNode],             // NEW: LLM-as-judge eval graders
  ["grader", graderNode],                  // Alias
  ["evals", graderNode],                   // Alias
  // ── RAG ingest + guardrails ─────────────────────────────────────────────────
  [docIngestNode.id, docIngestNode],       // NEW: url/text → chunked corpus
  ["ingest", docIngestNode],               // Alias
  [piiGuardNode.id, piiGuardNode],         // NEW: deterministic PII guardrail
  ["pii", piiGuardNode],                   // Alias
]);
