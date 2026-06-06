// Cortexa shared types & mock workflow data
import type { LucideIcon } from "lucide-react";
import {
  Sparkles, ShieldCheck, Image as ImageIcon, GitBranch, Brain,
  Shield, ScanText, ArrowUpDown, Search, Route, Globe, ClipboardCheck,
  FileText, EyeOff
} from "lucide-react";

export type NodeKind =
  // ── Core generation ───────────────────────────────────────────────────────
  | "text.run-any-llm"
  | "image.compositor"
  // ── Logic & control flow ──────────────────────────────────────────────────
  | "logic.qa-evaluator"
  | "logic.orchestrator"
  | "logic.global-evaluator"
  | "logic.decision"
  // ── Memory & RAG ──────────────────────────────────────────────────────────
  | "memory.retriever"
  | "memory.reranker"
  | "memory.ingest"
  // ── Tools / Grounding ─────────────────────────────────────────────────────
  | "tool.web-search"
  // ── Evals ─────────────────────────────────────────────────────────────────
  | "logic.grader"
  // ── Safety & Vision ───────────────────────────────────────────────────────
  | "safety.llama-guard"
  | "safety.pii-guard"
  | "vision.ocr"
  // ── Short aliases (used by pipeline templates; map to canonical above) ──────
  | "text"
  | "image"
  | "logic"
  | "output";

export type NodeStatus = "queued" | "running" | "completed" | "failed";

export interface PaletteEntry {
  kind: NodeKind;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: "cyan" | "purple" | "amber" | "green" | "red";
  /** cost tier for the badge */
  cost: "low" | "medium" | "high";
  /** typical latency (ms) for the badge */
  lat: number;
}

export const PALETTE: PaletteEntry[] = [
  // ── Core generation ───────────────────────────────────────────────────────
  { kind: "text.run-any-llm",         title: "LLM Text Generator", subtitle: "Kimi-K2 / Llama-3.3 / 3.1",      icon: Sparkles,    accent: "cyan",   cost: "medium", lat: 3000 },
  { kind: "image.compositor",         title: "Image Generator",    subtitle: "FLUX.1-dev via NVIDIA NIM",       icon: ImageIcon,   accent: "purple", cost: "high",   lat: 15000 },
  // ── Logic & control flow ──────────────────────────────────────────────────
  { kind: "logic.qa-evaluator",       title: "QA Evaluator",       subtitle: "structured eval + threshold",    icon: ShieldCheck, accent: "amber",  cost: "medium", lat: 3000 },
  { kind: "logic.orchestrator",       title: "Orchestrator",       subtitle: "route selector",                 icon: GitBranch,   accent: "cyan",   cost: "medium", lat: 1800 },
  { kind: "logic.global-evaluator",   title: "Global Evaluator",   subtitle: "Kimi-K2 pipeline judge",         icon: Brain,       accent: "purple", cost: "high",   lat: 3000 },
  { kind: "logic.decision",           title: "Decision Planner",   subtitle: "Kimi-K2 deep reasoning",         icon: Route,       accent: "cyan",   cost: "high",   lat: 3000 },
  // ── Memory & RAG ──────────────────────────────────────────────────────────
  { kind: "memory.retriever",         title: "Semantic Retriever", subtitle: "nv-embed-v1 cosine search",      icon: Search,      accent: "green",  cost: "low",    lat: 1500 },
  { kind: "memory.reranker",          title: "Reranker",           subtitle: "nv-rerankqa-mistral-4b-v3",      icon: ArrowUpDown, accent: "green",  cost: "low",    lat: 1200 },
  { kind: "memory.ingest",            title: "Document Ingest",    subtitle: "URL / text → chunked corpus",    icon: FileText,    accent: "green",  cost: "low",    lat: 1200 },
  // ── Tools / Grounding ─────────────────────────────────────────────────────
  { kind: "tool.web-search",          title: "Web Search",         subtitle: "Tavily / DuckDuckGo grounding",  icon: Globe,       accent: "green",  cost: "low",    lat: 2000 },
  // ── Evals ─────────────────────────────────────────────────────────────────
  { kind: "logic.grader",             title: "Eval Graders",       subtitle: "Tone / Claims / Sources / Read", icon: ClipboardCheck, accent: "amber", cost: "medium", lat: 3000 },
  // ── Safety & Vision ───────────────────────────────────────────────────────
  { kind: "safety.llama-guard",       title: "Safety Guard",       subtitle: "Llama Guard 4 classifier",       icon: Shield,      accent: "red",    cost: "low",    lat: 600 },
  { kind: "safety.pii-guard",         title: "PII Guard",          subtitle: "Regex mask / block · no LLM",    icon: EyeOff,      accent: "red",    cost: "low",    lat: 20 },
  { kind: "vision.ocr",               title: "OCR Extractor",      subtitle: "PaddleOCR text extraction",      icon: ScanText,    accent: "amber",  cost: "medium", lat: 2000 },
];

export const PALETTE_BY_KIND: Record<NodeKind, PaletteEntry> =
  PALETTE.reduce((acc, p) => ({ ...acc, [p.kind]: p }), {} as Record<NodeKind, PaletteEntry>);

// Map short alias kinds (used by templates) to their canonical palette entry,
// so the Inspector/canvas always resolve a meta entry (no undefined crash).
PALETTE_BY_KIND["text"] = PALETTE_BY_KIND["text.run-any-llm"];
PALETTE_BY_KIND["image"] = PALETTE_BY_KIND["image.compositor"];
PALETTE_BY_KIND["logic"] = PALETTE_BY_KIND["logic.qa-evaluator"];
PALETTE_BY_KIND["output"] = PALETTE_BY_KIND["logic.global-evaluator"];

export interface RunAttempt {
  attempt: number;
  status: NodeStatus;
  output?: { type: "text" | "image"; value: string };
  explanation?: string;
  confidence?: number;     // 0..1
  qa_feedback?: string[];  // present if this attempt was a retry triggered by QA fail
  usedMemory?: boolean;
}

export interface CortexaNodeData {
  kind: NodeKind;
  label: string;
  status: NodeStatus;
  currentAttempt: number;
  attempts: RunAttempt[];
  config: {
    role?: string;
    goal?: string;
    model?: string;
    threshold?: number;
    prompt?: string;
    /** node-specific config (provider, maxResults, rubric, format, graders, …) */
    [key: string]: any;
  };
  // ── Runtime fields (populated by poll / SSE) ────────────────────────────────
  output?: any;
  error?: any;
  confidence?: number;
  explanation?: string;
  /** short live output snippet streamed via SSE for canvas preview */
  liveOutput?: string;
}

// ---- Initial seeded workflow (the hero demo) ----

export const INITIAL_NODES = [
  {
    id: "n-orch",
    type: "cortexa",
    position: { x: 40, y: 200 },
    data: {
      kind: "logic.orchestrator",
      label: "Campaign Orchestrator",
      status: "queued",
      currentAttempt: 1,
      attempts: [{ attempt: 1, status: "queued" }],
      config: {
        role: "Campaign Director",
        goal: "Coordinate copy + visual generation for an enterprise launch.",
      },
    } satisfies CortexaNodeData,
  },
  {
    id: "n-text",
    type: "cortexa",
    position: { x: 360, y: 80 },
    data: {
      kind: "text.run-any-llm",
      label: "Headline Generator",
      status: "queued",
      currentAttempt: 1,
      attempts: [{ attempt: 1, status: "queued" }],
      config: {
        role: "Senior Brand Copywriter",
        goal: "Produce a punchy enterprise-grade headline under 12 words.",
        model: "gpt-4.1",
        prompt: "Write a launch headline for an agentic AI orchestration platform.",
      },
    } satisfies CortexaNodeData,
  },
  {
    id: "n-qa",
    type: "cortexa",
    position: { x: 700, y: 80 },
    data: {
      kind: "logic.qa-evaluator",
      label: "Brand QA",
      status: "queued",
      currentAttempt: 1,
      attempts: [{ attempt: 1, status: "queued" }],
      config: {
        role: "Brand Voice Auditor",
        goal: "Reject anything that sounds generic or under-confident.",
        threshold: 0.8,
      },
    } satisfies CortexaNodeData,
  },
  {
    id: "n-img",
    type: "cortexa",
    position: { x: 360, y: 340 },
    data: {
      kind: "image.compositor",
      label: "Hero Visual",
      status: "queued",
      currentAttempt: 1,
      attempts: [{ attempt: 1, status: "queued" }],
      config: {
        role: "Art Director",
        goal: "Render a cyber-industrial hero composition.",
        model: "image-v3",
      },
    } satisfies CortexaNodeData,
  },
  {
    id: "n-global",
    type: "cortexa",
    position: { x: 1040, y: 220 },
    data: {
      kind: "logic.global-evaluator",
      label: "Global Evaluator",
      status: "queued",
      currentAttempt: 1,
      attempts: [{ attempt: 1, status: "queued" }],
      config: {
        role: "Release Gate",
        goal: "Confirm overall campaign coherence before publish.",
      },
    } satisfies CortexaNodeData,
  },
];

export const INITIAL_EDGES = [
  { id: "e1", source: "n-orch", target: "n-text", animated: false },
  { id: "e2", source: "n-orch", target: "n-img",  animated: false },
  { id: "e3", source: "n-text", target: "n-qa",   animated: false },
  { id: "e4", source: "n-qa",   target: "n-global", animated: false },
  { id: "e5", source: "n-img",  target: "n-global", animated: false },
];
