import { CortexaClient } from "./client";
import { ApiMemory } from "./types";

export class MemoryApi {
  constructor(private readonly client: CortexaClient) {}

  /** Fetch all memory entries for a workflow */
  findAll(workflowId: string): Promise<ApiMemory[]> {
    return this.client.get<ApiMemory[]>(`/api/workflows/${workflowId}/memory`);
  }

  /** Add a context or history entry to workflow memory */
  add(
    workflowId: string,
    entry: { type: "context" | "history"; key: string; value: string }
  ): Promise<ApiMemory> {
    return this.client.post<ApiMemory>(`/api/workflows/${workflowId}/memory`, entry);
  }

  /** Delete a specific memory entry by ID */
  delete(workflowId: string, memoryId: string): Promise<{ ok: boolean }> {
    return this.client.delete<{ ok: boolean }>(
      `/api/workflows/${workflowId}/memory/${memoryId}`
    );
  }

  /** Convenience: get all context entries as a single concatenated string */
  async getContextString(workflowId: string): Promise<string> {
    const memories = await this.findAll(workflowId);
    return memories
      .filter((m) => m.type === "context")
      .map((m) => m.value)
      .join("\n");
  }
}
