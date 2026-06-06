// ─── @cortexa/sdk — Public API ────────────────────────────────────────────────

export * from "./types";
export * from "./client";
export * from "./runs";
export * from "./workflows";
export * from "./memory";

import { CortexaClient } from "./client";
import { RunsApi } from "./runs";
import { WorkflowsApi } from "./workflows";
import { MemoryApi } from "./memory";
import { CortexaSdkConfig } from "./types";

// ─── SDK Factory ──────────────────────────────────────────────────────────────

export interface CortexaSdk {
  runs: RunsApi;
  workflows: WorkflowsApi;
  memory: MemoryApi;
  /** Raw HTTP client — for custom endpoints not yet in the SDK */
  client: CortexaClient;
}

/**
 * Create a fully-configured Cortexa SDK instance.
 *
 * @example
 * // In a Vite app (proxied), no config needed:
 * const sdk = createCortexaSdk();
 *
 * // With a custom API base URL:
 * const sdk = createCortexaSdk({ baseUrl: "http://localhost:3001" });
 */
export function createCortexaSdk(config: CortexaSdkConfig = {}): CortexaSdk {
  const client = new CortexaClient(config);
  return {
    runs: new RunsApi(client),
    workflows: new WorkflowsApi(client),
    memory: new MemoryApi(client),
    client,
  };
}

/** Default singleton instance — works out-of-the-box with Vite proxy */
export const cortexaSdk = createCortexaSdk();
