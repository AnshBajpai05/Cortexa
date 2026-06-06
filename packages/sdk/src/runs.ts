import { CortexaClient } from "./client";
import { ApiRun, ApiRunLog, PollStatusResponse, TriggerResponse } from "./types";

export class RunsApi {
  constructor(private readonly client: CortexaClient) {}

  /** Trigger all nodes in a workflow (topological order via BullMQ) */
  trigger(workflowId: string): Promise<TriggerResponse> {
    return this.client.post<TriggerResponse>(`/api/runs/trigger/${workflowId}`);
  }

  /** Get all runs for a workflow */
  findByWorkflow(workflowId: string): Promise<ApiRun[]> {
    return this.client.get<ApiRun[]>(`/api/runs/workflow/${workflowId}`);
  }

  /** Get a single run by ID */
  findOne(runId: string): Promise<ApiRun> {
    return this.client.get<ApiRun>(`/api/runs/${runId}`);
  }

  /** Get granular execution logs for a run */
  findLogs(runId: string): Promise<ApiRunLog[]> {
    return this.client.get<ApiRunLog[]>(`/api/runs/${runId}/logs`);
  }

  /** Poll aggregated status for a workflow (used by the frontend poller) */
  pollStatus(workflowId: string): Promise<PollStatusResponse> {
    return this.client.get<PollStatusResponse>(`/api/runs/status/${workflowId}`);
  }

  /**
   * Kick off the self-correction loop.
   * Triggers a new versioned attempt on the upstream node with guided feedback.
   */
  retryBackward(runId: string, feedback: string[]): Promise<ApiRun | null> {
    return this.client.post<ApiRun | null>(`/api/runs/${runId}/retry-backward`, { feedback });
  }

  /**
   * Polls until the workflow finishes (all nodes completed or any failed).
   * Returns the final PollStatusResponse.
   *
   * @param workflowId  The workflow to watch
   * @param intervalMs  Polling interval in milliseconds (default: 2000)
   * @param timeoutMs   Max wait time in milliseconds (default: 300000 = 5 min)
   * @param onTick      Optional callback called on each poll with current status
   */
  async waitUntilFinished(
    workflowId: string,
    options: {
      intervalMs?: number;
      timeoutMs?: number;
      onTick?: (status: PollStatusResponse) => void;
    } = {}
  ): Promise<PollStatusResponse> {
    const { intervalMs = 2000, timeoutMs = 300_000, onTick } = options;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const status = await this.pollStatus(workflowId);
      onTick?.(status);
      if (status.isFinished) return status;
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(
      `[CortexaSDK] waitUntilFinished: timed out after ${timeoutMs}ms for workflow ${workflowId}`
    );
  }
}
