"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rerankNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const RerankNodeConfig = zod_1.z.object({
    topN: zod_1.z.number().int().min(1).max(20).default(5),
    minScore: zod_1.z.number().min(0).max(1).default(0.1),
    model: zod_1.z
        .string()
        .default("nvidia/nv-rerankqa-mistral-4b-v3"),
});
exports.rerankNode = {
    id: "memory.reranker",
    name: "Reranker",
    description: "Re-scores and re-orders a set of retrieved documents against a query using nvidia/nv-rerankqa-mistral-4b-v3. Eliminates irrelevant context before generation — critical for RAG quality.",
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
    run: async (ctx, rawConfig) => {
        const config = RerankNodeConfig.parse(rawConfig);
        const query = ctx.inputs["query"];
        const docsRaw = ctx.inputs["documents"];
        if (!query) {
            throw new Error(`[rerankNode] Missing required input: query (runId=${ctx.runId})`);
        }
        if (!docsRaw) {
            throw new Error(`[rerankNode] Missing required input: documents (runId=${ctx.runId})`);
        }
        let passages;
        const parsed = typeof docsRaw === "string" ? JSON.parse(docsRaw) : docsRaw;
        if (Array.isArray(parsed)) {
            passages = parsed.map((d) => typeof d === "string" ? d : d.text ?? JSON.stringify(d));
        }
        else {
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
        const rankings = await tools_1.tools.rerank(query, passages, {
            model: config.model,
            topN: config.topN,
        }, ctx);
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
//# sourceMappingURL=rerank.js.map