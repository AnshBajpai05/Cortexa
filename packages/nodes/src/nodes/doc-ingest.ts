import { z } from "zod";
import axios from "axios";
import { NodeManifest, RunContext, NodeOutput } from "../types";

// ─── Config Schema ────────────────────────────────────────────────────────────
const DocIngestNodeConfig = z.object({
  /** auto = fetch if input looks like a URL, else treat as raw text */
  mode: z.enum(["auto", "url", "text"]).default("auto"),
  /** Target chunk size in characters */
  chunkSize: z.number().int().min(100).max(8000).default(800),
  /** Overlap between consecutive chunks (chars) */
  chunkOverlap: z.number().int().min(0).max(2000).default(100),
  /** Static source (URL or text) if no input wired */
  source: z.string().optional(),
});

export type DocIngestNodeConfigType = z.infer<typeof DocIngestNodeConfig>;

// ─── Helpers ────────────────────────────────────────────────────────────────
function looksLikeUrl(s: string): boolean {
  return /^https?:\/\/\S+$/i.test(s.trim());
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chunk on paragraph boundaries where possible, with char overlap. */
function chunkText(text: string, size: number, overlap: number): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= size) return clean ? [clean] : [];

  const paras = clean.split(/\n\s*\n/);
  const chunks: string[] = [];
  let buf = "";

  for (const p of paras) {
    if ((buf + "\n\n" + p).length > size && buf) {
      chunks.push(buf.trim());
      // start next chunk with tail overlap of previous
      buf = overlap > 0 ? buf.slice(-overlap) + "\n\n" + p : p;
    } else {
      buf = buf ? buf + "\n\n" + p : p;
    }
    // hard-split very long single paragraphs
    while (buf.length > size) {
      chunks.push(buf.slice(0, size).trim());
      buf = buf.slice(size - overlap);
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const docIngestNode: NodeManifest = {
  id: "memory.ingest",
  name: "Document Ingest",
  description:
    "Turns a URL or raw text/markdown into a clean, chunked corpus ready for the Semantic Retriever. Fetches + strips HTML, chunks on paragraph boundaries with overlap. The missing front-half of the RAG pipeline — wire its `corpus` output into the Retriever's corpus input.",
  category: "memory",

  costTier: "low",
  avgLatencyMs: 1200,
  inputs: [
    { id: "source", label: "URL or Text", type: "text", required: true },
  ],

  outputs: [
    { id: "corpus", label: "Chunked Corpus (JSON array)", type: "json", semanticType: "json" },
    { id: "text", label: "Full Clean Text", type: "text", semanticType: "text" },
    { id: "chunk_count", label: "Chunk Count", type: "text", semanticType: "text" },
  ],

  configSchema: DocIngestNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = DocIngestNodeConfig.parse(rawConfig);

    const source = (ctx.inputs["source"] ||
      ctx.inputs["text"] ||
      ctx.inputs["value"] ||
      ctx.inputs["url"] ||
      config.source) as string;

    if (!source) {
      throw new Error(
        `[docIngestNode] Missing required input: source (runId=${ctx.runId}). Available: ${Object.keys(ctx.inputs).join(", ")}`
      );
    }

    const isUrl = config.mode === "url" || (config.mode === "auto" && looksLikeUrl(source));

    let rawText = source;
    let origin = "text";
    if (isUrl) {
      origin = source.trim();
      try {
        const { data } = await axios.get<string>(source.trim(), {
          timeout: 20_000,
          responseType: "text",
          headers: { "User-Agent": "Cortexa-DocIngest/1.0" },
        });
        rawText = stripHtml(typeof data === "string" ? data : String(data));
      } catch (err: any) {
        throw new Error(`[docIngestNode] Failed to fetch URL "${source}": ${err.message}`);
      }
    }

    const corpus = chunkText(rawText, config.chunkSize, config.chunkOverlap);

    return {
      value: corpus,
      corpus,
      text: rawText,
      chunk_count: String(corpus.length),
      label: `Ingested ${corpus.length} chunk(s) from ${isUrl ? "URL" : "text"}`,
      explanation: `Ingested ${rawText.length} chars from ${origin} → ${corpus.length} chunks (size ${config.chunkSize}, overlap ${config.chunkOverlap}).`,
      confidence: corpus.length ? 0.95 : 0.1,
    };
  },
};
