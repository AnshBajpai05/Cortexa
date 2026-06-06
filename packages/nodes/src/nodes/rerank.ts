import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { tools } from "../tools";

// ─── Config Schema ────────────────────────────────────────────────────────────
const RerankNodeConfig = z.object({
  /** How many top documents to return after reranking */
  topN: z.number().int().min(1).max(20).default(5),
  /** Minimum relevance score threshold (0–1) — documents below this are filtered */
  minScore: z.number().min(0).max(1).default(0.1),
  /** Reranking model — only one option for now, but extensible */
  model: z
    .string()
    .default("nvidia/nv-rerankqa-mistral-4b-v3"),
});

export type RerankNodeConfigType = z.infer<typeof RerankNodeConfig>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const rerankNode: NodeManifest = {
  id: "memory.reranker",
  name: "Reranker",
  description:
    "Re-scores and re-orders a set of retrieved documents against a query using nvidia/nv-rerankqa-mistral-4b-v3. Eliminates irrelevant context before generation — critical for RAG quality.",
  category: "logic",

  costTier: "low",
  avgLatencyMs: 1500,
  inputs: [
    {
      id: "query",
      label: "Search Query",
      type: "text",
      required: true,
    },
    {
      id: "documents",
      label: "Candidate Documents (JSON array of strings)",
      type: "json",
      required: true,
    },
  ],

  outputs: [
    { id: "ranked_documents", label: "Ranked Documents (JSON)", type: "json", semanticType: "json" },
    { id: "top_document", label: "Best Match (text)", type: "text", semanticType: "text" },
    { id: "scores", label: "Relevance Scores (JSON)", type: "json", semanticType: "json" },
  ],

  configSchema: RerankNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = RerankNodeConfig.parse(rawConfig);
    const query = ctx.inputs["query"] as string;
    const docsRaw = ctx.inputs["documents"];

    if (!query) {
      throw new Error(`[rerankNode] Missing required input: query (runId=${ctx.runId})`);
    }
    if (!docsRaw) {
      throw new Error(`[rerankNode] Missing required input: documents (runId=${ctx.runId})`);
    }

    // Normalise — accept string[] or {text: string}[] or raw JSON string
    let passages: string[];
    const parsed = typeof docsRaw === "string" ? JSON.parse(docsRaw) : docsRaw;
    if (Array.isArray(parsed)) {
      passages = parsed.map((d: unknown) =>
        typeof d === "string" ? d : (d as { text: string }).text ?? JSON.stringify(d)
      );
    } else {
      throw new Error(`[rerankNode] documents must be a JSON array`);
    }

    if (passages.length === 0) {
      return {
        value: [],
        ranked_documents: [],
        top_document: "",
        scores: [],
        label: "Rerank: 0 documents",
        explanation: "No documents provided to rerank.",
        confidence: 0,
      };
    }

    console.log(`[rerankNode] Reranking ${passages.length} passages for query: "${query.slice(0, 60)}..."`);

    const rankings = await tools.rerank(query, passages, {
      model: config.model,
      topN: config.topN,
    }, ctx);

    // Filter by minimum score and reconstruct ordered document list
    const filtered = rankings
      .filter((r) => r.relevance_score >= config.minScore)
      .slice(0, config.topN);

    const rankedDocs = filtered.map((r) => ({
      text: passages[r.index],
      score: r.relevance_score,
      originalIndex: r.index,
    }));

    const topDocument = rankedDocs[0]?.text ?? "";
    const scores = filtered.map((r) => r.relevance_score);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    return {
      value: rankedDocs,
      ranked_documents: rankedDocs,
      top_document: topDocument,
      scores,
      label: `Rerank: ${rankedDocs.length}/${passages.length} docs kept (avg score: ${avgScore.toFixed(2)})`,
      explanation: `Reranked ${passages.length} documents using ${config.model}. Kept ${rankedDocs.length} above score ${config.minScore}. Top document score: ${scores[0]?.toFixed(3) ?? "N/A"}.`,
      confidence: avgScore,
    };
  },
};
