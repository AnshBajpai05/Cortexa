import { CortexaClient } from "./client";
import { ApiWorkflow } from "./types";

export interface CreateWorkflowDto {
  name?: string;
  workspaceId: string;
  jsonGraph?: {
    nodes: { id: string; data: Record<string, unknown> }[];
    edges: { source: string; target: string }[];
    config?: { maxRetryAttempts?: number };
  };
}

export interface UpdateWorkflowDto {
  name?: string;
  jsonGraph?: {
    nodes: { id: string; data: Record<string, unknown> }[];
    edges: { source: string; target: string }[];
    config?: { maxRetryAttempts?: number };
  };
}

export class WorkflowsApi {
  constructor(private readonly client: CortexaClient) {}

  /** List all workflows in a workspace */
  findByWorkspace(workspaceId: string): Promise<ApiWorkflow[]> {
    return this.client.get<ApiWorkflow[]>(`/api/workflows?workspaceId=${workspaceId}`);
  }

  /** Get a single workflow */
  findOne(workflowId: string): Promise<ApiWorkflow> {
    return this.client.get<ApiWorkflow>(`/api/workflows/${workflowId}`);
  }

  /** Create a new workflow */
  create(dto: CreateWorkflowDto): Promise<ApiWorkflow> {
    return this.client.post<ApiWorkflow>("/api/workflows", dto);
  }

  /** Update an existing workflow (e.g. save canvas state) */
  update(workflowId: string, dto: UpdateWorkflowDto): Promise<ApiWorkflow> {
    return this.client.patch<ApiWorkflow>(`/api/workflows/${workflowId}`, dto);
  }

  /** Delete a workflow */
  delete(workflowId: string): Promise<{ ok: boolean }> {
    return this.client.delete<{ ok: boolean }>(`/api/workflows/${workflowId}`);
  }

  /**
   * Convenience: save a React Flow canvas to the backend.
   * Creates a new workflow if workflowId is omitted, otherwise updates it.
   * Returns the workflow ID.
   */
  async saveCanvas(
    nodes: { id: string; data: Record<string, unknown> }[],
    edges: { source: string; target: string }[],
    options: {
      workspaceId?: string;
      workflowId?: string;
      name?: string;
    } = {}
  ): Promise<string> {
    const workspaceId = options.workspaceId ?? "default-workspace";
    const jsonGraph = { nodes, edges };

    if (options.workflowId) {
      await this.update(options.workflowId, { jsonGraph, name: options.name });
      return options.workflowId;
    } else {
      const wf = await this.create({
        name: options.name ?? "Cortexa Run",
        workspaceId,
        jsonGraph,
      });
      return wf.id;
    }
  }
}
