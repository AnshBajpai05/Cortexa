"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retrieveNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const RetrieveNodeConfig = zod_1.z.object({
    topK: zod_1.z.number().int().min(1).max(50).default(10),
    embeddingModel: zod_1.z
        .enum(["nvidia/nv-embed-v1", "baai/bge-m3"])
        .default("nvidia/nv-embed-v1"),
});
function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
exports.retrieveNode = {
    id: "memory.retriever",
    name: "Semantic Retriever",
    description: "Embeds a query and a corpus of documents using nvidia/nv-embed-v1, then returns the top-K most semantically similar documents via cosine similarity. Feed output directly into the Reranker for full RAG quality.",
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
            id: "corpus",
            label: "Document Corpus (JSON array of strings)",
            type: "json",
            required: true,
        },
    ],
    outputs: [
        { id: "documents", label: "Retrieved Documents (JSON)", type: "json", semanticType: "json" },
        { id: "top_document", label: "Best Match (text)", type: "text", semanticType: "text" },
        { id: "query_embedding", label: "Query Embedding (JSON)", type: "json", semanticType: "json" },
    ],
    configSchema: RetrieveNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = RetrieveNodeConfig.parse(rawConfig);
        const query = ctx.inputs["query"];
        const corpusRaw = ctx.inputs["corpus"];
        if (!query) {
            throw new Error(`[retrieveNode] Missing required input: query (runId=${ctx.runId})`);
        }
        if (!corpusRaw) {
            throw new Error(`[retrieveNode] Missing required input: corpus (runId=${ctx.runId})`);
        }
        const parsed = typeof corpusRaw === "string" ? JSON.parse(corpusRaw) : corpusRaw;
        if (!Array.isArray(parsed)) {
            throw new Error(`[retrieveNode] corpus must be a JSON array of strings`);
        }
        const corpus = parsed.map((d) => typeof d === "string" ? d : JSON.stringify(d));
        if (corpus.length === 0) {
            return {
                value: [],
                documents: [],
                top_document: "",
                query_embedding: [],
                label: "Retrieve: empty corpus",
                explanation: "No documents in corpus to retrieve from.",
                confidence: 0,
            };
        }
        console.log(`[retrieveNode] Embedding query + ${corpus.length} corpus docs via ${config.embeddingModel}...`);
        const allTexts = [query, ...corpus];
        const embeddings = await tools_1.tools.embed(allTexts, {
            model: config.embeddingModel,
            inputType: "query",
        }, ctx);
        const queryEmbedding = embeddings[0];
        const docEmbeddings = embeddings.slice(1);
        const scored = corpus.map((doc, i) => ({
            text: doc,
            score: cosineSimilarity(queryEmbedding, docEmbeddings[i]),
            originalIndex: i,
        }));
        scored.sort((a, b) => b.score - a.score);
        const topDocs = scored.slice(0, config.topK);
        const topDocument = topDocs[0]?.text ?? "";
        const avgScore = topDocs.reduce((sum, d) => sum + d.score, 0) / topDocs.length;
        return {
            value: topDocs,
            documents: topDocs,
            top_document: topDocument,
            query_embedding: queryEmbedding,
            label: `Retrieved ${topDocs.length}/${corpus.length} docs (top score: ${topDocs[0]?.score.toFixed(3) ?? "N/A"})`,
            explanation: `Semantically retrieved top-${config.topK} documents from a corpus of ${corpus.length} using ${config.embeddingModel}. Average similarity: ${avgScore.toFixed(3)}.`,
            confidence: Math.min(0.98, avgScore),
        };
    },
};
//# sourceMappingURL=retrieve.js.map