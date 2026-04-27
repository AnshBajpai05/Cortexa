// Cortexa shared types & mock workflow data
import type { LucideIcon } from "lucide-react";
import { Sparkles, ShieldCheck, Image as ImageIcon, GitBranch, Brain } from "lucide-react";

export type NodeKind =
  | "text.run-any-llm"
  | "logic.qa-evaluator"
  | "image.compositor"
  | "logic.orchestrator"
  | "logic.global-evaluator";

export type NodeStatus = "queued" | "running" | "completed" | "failed";

export interface PaletteEntry {
  kind: NodeKind;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  accent: "cyan" | "purple" | "amber";
}

export const PALETTE: PaletteEntry[] = [
  { kind: "text.run-any-llm",       title: "LLM Text Generator", subtitle: "text.run-any-llm",      icon: Sparkles,    accent: "cyan" },
  { kind: "logic.qa-evaluator",     title: "QA Evaluator",       subtitle: "logic.qa-evaluator",    icon: ShieldCheck, accent: "amber" },
  { kind: "image.compositor",       title: "Image Generator",    subtitle: "image.compositor",      icon: ImageIcon,   accent: "purple" },
  { kind: "logic.orchestrator",     title: "Orchestrator",       subtitle: "logic.orchestrator",    icon: GitBranch,   accent: "cyan" },
  { kind: "logic.global-evaluator", title: "Global Evaluator",   subtitle: "logic.global-evaluator",icon: Brain,       accent: "purple" },
];

export const PALETTE_BY_KIND: Record<NodeKind, PaletteEntry> =
  PALETTE.reduce((acc, p) => ({ ...acc, [p.kind]: p }), {} as Record<NodeKind, PaletteEntry>);

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
  };
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
