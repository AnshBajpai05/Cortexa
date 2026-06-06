import { z } from "zod";
import axios from "axios";
import { NodeManifest, RunContext, NodeOutput } from "../types";

// ─── Config Schema ────────────────────────────────────────────────────────────
const WebSearchNodeConfig = z.object({
  /** auto = Tavily if key present, else DuckDuckGo, else mock */
  provider: z.enum(["auto", "tavily", "duckduckgo", "mock"]).default("auto"),
  /** Max results to return */
  maxResults: z.number().int().min(1).max(10).default(5),
  /** Tavily-only: include a synthesized answer */
  includeAnswer: z.boolean().default(true),
  /** Static query fallback if no input wired */
  query: z.string().optional(),
});

export type WebSearchNodeConfigType = z.infer<typeof WebSearchNodeConfig>;

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

// ─── Provider: Tavily (free tier ~1k/mo, real web search) ───────────────────
async function searchTavily(
  query: string,
  apiKey: string,
  maxResults: number,
  includeAnswer: boolean
): Promise<{ results: SearchResult[]; answer: string }> {
  const { data } = await axios.post(
    "https://api.tavily.com/search",
    {
      api_key: apiKey,
      query,
      max_results: maxResults,
      include_answer: includeAnswer,
      search_depth: "basic",
    },
    { headers: { "Content-Type": "application/json" }, timeout: 20_000 }
  );
  const results: SearchResult[] = (data.results ?? []).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.content ?? "",
    score: r.score,
  }));
  return { results, answer: data.answer ?? "" };
}

// ─── Provider: DuckDuckGo Instant Answer (free, keyless, grounding-lite) ─────
async function searchDuckDuckGo(
  query: string,
  maxResults: number
): Promise<{ results: SearchResult[]; answer: string }> {
  const { data } = await axios.get("https://api.duckduckgo.com/", {
    params: { q: query, format: "json", no_html: 1, t: "cortexa" },
    timeout: 15_000,
  });

  const results: SearchResult[] = [];
  if (data.AbstractText) {
    results.push({
      title: data.Heading || query,
      url: data.AbstractURL || "",
      snippet: data.AbstractText,
    });
  }
  // RelatedTopics may nest under Topics groups — flatten one level.
  const flatten = (arr: any[]): any[] =>
    arr.flatMap((t) => (t.Topics ? flatten(t.Topics) : [t]));
  for (const t of flatten(data.RelatedTopics ?? [])) {
    if (t.Text && t.FirstURL) {
      results.push({ title: t.Text.split(" - ")[0], url: t.FirstURL, snippet: t.Text });
    }
    if (results.length >= maxResults) break;
  }
  return { results: results.slice(0, maxResults), answer: data.AbstractText ?? "" };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function isRealKey(key: string | undefined): boolean {
  return !!key && !key.startsWith("mock") && key.trim() !== "";
}

function formatResults(results: SearchResult[], answer: string): string {
  const lines: string[] = [];
  if (answer) lines.push(`Summary: ${answer}\n`);
  results.forEach((r, i) => {
    lines.push(`[${i + 1}] ${r.title}\n${r.snippet}\nSource: ${r.url}\n`);
  });
  return lines.join("\n").trim();
}

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const webSearchNode: NodeManifest = {
  id: "tool.web-search",
  name: "Web Search",
  description:
    "Grounds the pipeline in live web results. Uses Tavily (free tier) when TAVILY_API_KEY is set, falls back to keyless DuckDuckGo, then mock. Outputs formatted, citation-ready text plus a structured results array — wire into an LLM/analyst node as context to stop hallucination.",
  category: "memory",

  costTier: "low",
  avgLatencyMs: 2000,
  inputs: [
    { id: "query", label: "Search Query", type: "text", required: true },
  ],

  outputs: [
    { id: "text", label: "Formatted Results + Citations", type: "text", semanticType: "text" },
    { id: "context", label: "Context (alias of text)", type: "text", semanticType: "text" },
    { id: "results", label: "Structured Results (JSON)", type: "json", semanticType: "json" },
    { id: "answer", label: "Synthesized Answer", type: "text", semanticType: "text" },
  ],

  configSchema: WebSearchNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = WebSearchNodeConfig.parse(rawConfig);

    const query = (ctx.inputs["query"] ||
      ctx.inputs["text"] ||
      ctx.inputs["prompt"] ||
      ctx.inputs["value"] ||
      config.query) as string;

    if (!query) {
      throw new Error(
        `[webSearchNode] Missing required input: query (runId=${ctx.runId}). Available: ${Object.keys(ctx.inputs).join(", ")}`
      );
    }

    const tavilyKey = (ctx.env as any).TAVILY_API_KEY as string | undefined;

    // Resolve provider
    let provider = config.provider;
    if (provider === "auto") {
      provider = isRealKey(tavilyKey) ? "tavily" : "duckduckgo";
    }

    let results: SearchResult[] = [];
    let answer = "";

    try {
      if (provider === "tavily") {
        if (!isRealKey(tavilyKey)) throw new Error("TAVILY_API_KEY not set");
        ({ results, answer } = await searchTavily(query, tavilyKey!, config.maxResults, config.includeAnswer));
      } else if (provider === "duckduckgo") {
        ({ results, answer } = await searchDuckDuckGo(query, config.maxResults));
      } else {
        // mock
        results = [
          { title: `[MOCK] Result for "${query}"`, url: "https://example.com", snippet: "Mock web result — set TAVILY_API_KEY or use duckduckgo provider for live search." },
        ];
        answer = "";
      }
    } catch (err: any) {
      console.warn(`[webSearchNode] ${provider} failed (${err.message}). Falling back to DuckDuckGo...`);
      try {
        ({ results, answer } = await searchDuckDuckGo(query, config.maxResults));
        provider = "duckduckgo";
      } catch (err2: any) {
        console.error(`[webSearchNode] All providers failed: ${err2.message}`);
        results = [];
        answer = "";
      }
    }

    const text = results.length
      ? formatResults(results, answer)
      : `No web results found for "${query}".`;

    return {
      value: text,
      text,
      context: text,
      results,
      answer,
      label: `Web Search: ${results.length} result(s) via ${provider}`,
      explanation: `Searched the web for "${query.slice(0, 60)}" via ${provider}, returned ${results.length} result(s).`,
      confidence: results.length ? 0.9 : 0.2,
    };
  },
};
