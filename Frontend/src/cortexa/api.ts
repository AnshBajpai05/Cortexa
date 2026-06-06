import { Edge, Node } from "reactflow";
import { CortexaNodeData } from "./types";

const WORKSPACE_ID = "default-workspace";

// PPT/convert worker (FastAPI). Override via VITE_PPT_WORKER_URL.
const PPT_WORKER =
  (import.meta as any).env?.VITE_PPT_WORKER_URL || "http://localhost:8000";

export interface PdfConvertResult {
  filename: string;
  markdown: string;
  pages: number;
  chars: number;
  scanned: boolean;
  title: string;
}

export interface ApiRun {
  id: string;
  nodeId: string;
  status: "queued" | "running" | "completed" | "failed";
  attempt: number;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  error: Record<string, any>;
  startedAt: string | null;
  finishedAt: string | null;
}

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

export const api = {
  /**
   * Saves the React Flow canvas (nodes and edges) as a Workflow in the backend.
   * If workflowId is provided, it updates it. Otherwise creates a new one.
   */
  saveWorkflow: async (
    nodes: Node<CortexaNodeData>[],
    edges: Edge[],
    workflowId?: string
  ): Promise<string> => {
    // Transform data slightly to match what backend expects
    const payload = {
      workspaceId: WORKSPACE_ID,
      jsonGraph: {
        nodes: nodes.map((n) => ({ id: n.id, data: n.data })),
        edges: edges.map((e) => ({ source: e.source, target: e.target })),
      },
    };

    if (workflowId) {
      const res = await fetch(`/api/workflows/${workflowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to update workflow");
      return workflowId;
    } else {
      const res = await fetch(`/api/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Cortexa Run", ...payload }),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      const data = await res.json();
      return data.id;
    }
  },

  /**
   * Triggers the backend orchestration engine for a given workflow.
   */
  triggerWorkflow: async (workflowId: string): Promise<any> => {
    const res = await fetch(`/api/runs/trigger/${workflowId}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to trigger workflow");
    return res.json();
  },

  /**
   * Polls the aggregated status of all runs for a workflow.
   */
  pollStatus: async (workflowId: string): Promise<PollStatusResponse> => {
    const res = await fetch(`/api/runs/status/${workflowId}`);
    if (!res.ok) throw new Error("Failed to poll status");
    return res.json();
  },

  /**
   * Uploads a PDF to the convert worker and returns extracted markdown.
   */
  convertPdf: async (file: File): Promise<PdfConvertResult> => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`${PPT_WORKER}/convert/pdf`, { method: "POST", body: fd });
    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      throw new Error(detail?.detail || `PDF convert failed (${res.status})`);
    }
    return res.json();
  },

  /**
   * Opens a Server-Sent Events stream of live node status changes for a
   * workflow. Returns the EventSource — caller must .close() it when done.
   * Falls back gracefully: if SSE drops, the recursive poll still drives state.
   */
  streamEvents: (workflowId: string): EventSource =>
    new EventSource(`/api/runs/events/${workflowId}`),

  /**
   * Fetches granular execution logs for a specific node run.
   */
  fetchLogs: async (runId: string) => {
    const res = await fetch(`/api/runs/${runId}/logs`);
    if (!res.ok) throw new Error("Failed to fetch logs");
    return res.json();
  },

  /**
   * Fetches workspace memory for context injection.
   */
  fetchMemory: async (workflowId: string) => {
    const res = await fetch(`/api/workflows/${workflowId}/memory`);
    if (!res.ok) throw new Error("Failed to fetch memory");
    return res.json();
  },

  /**
   * Adds an entry to workspace memory.
   */
  addMemory: async (workflowId: string, key: string, value: string) => {
    const res = await fetch(`/api/workflows/${workflowId}/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "context", key, value }),
    });
    if (!res.ok) throw new Error("Failed to add memory");
    return res.json();
  },
  /**
   * Fetches workflow performance metrics (latency, cost, success rate).
   */
  fetchMetrics: async (workflowId: string) => {
    const res = await fetch(`/api/metrics/workflow/${workflowId}/dashboard`);
    if (!res.ok) throw new Error("Failed to fetch metrics");
    return res.json();
  },
};
