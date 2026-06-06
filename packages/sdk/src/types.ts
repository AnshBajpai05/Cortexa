// ─── Cortexa SDK — Shared Types ───────────────────────────────────────────────

export type RunStatus = "queued" | "running" | "completed" | "failed";
export type AssetKind = "image" | "text" | "video";

// ─── Run ──────────────────────────────────────────────────────────────────────
export interface ApiRun {
  id: string;
  nodeId: string;
  workflowId: string;
  status: RunStatus;
  attempt: number;
  previousRunId?: string | null;
  inputs: Record<string, unknown> | null;
  outputs: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
}

// ─── Run Log ──────────────────────────────────────────────────────────────────
export interface ApiRunLog {
  id: string;
  runId: string;
  nodeId: string;
  status: string; // "started" | "success" | "failed" | "retry" | "fallback"
  inputJson?: Record<string, unknown>;
  outputJson?: Record<string, unknown>;
  errorJson?: Record<string, unknown>;
  attempt: number;
  startedAt: string;
  finishedAt?: string | null;
}

// ─── Poll Status ──────────────────────────────────────────────────────────────
export interface PollStatusResponse {
  workflowId: string;
  total: number;
  completed: number;
  failed: number;
  running: number;
  queued: number;
  isFinished: boolean;
  runs: ApiRun[];
}

// ─── Trigger Response ─────────────────────────────────────────────────────────
export interface TriggerResponse {
  message: string;
  runIds: string[];
  executionOrder: string[];
}

// ─── Workflow ─────────────────────────────────────────────────────────────────
export interface ApiWorkflow {
  id: string;
  name: string;
  workspaceId: string;
  jsonGraph: {
    nodes: { id: string; data: Record<string, unknown> }[];
    edges: { source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
    config?: { maxRetryAttempts?: number };
  };
  createdAt: string;
  updatedAt: string;
}

// ─── Memory ───────────────────────────────────────────────────────────────────
export interface ApiMemory {
  id: string;
  workflowId: string;
  type: string; // "context" | "history"
  key: string;
  value: string;
  createdAt: string;
}

// ─── SDK Config ───────────────────────────────────────────────────────────────
export interface CortexaSdkConfig {
  /** Base URL of the API — defaults to "" (proxied by Vite / same origin) */
  baseUrl?: string;
  /** Optional bearer token for authenticated requests */
  token?: string;
}
