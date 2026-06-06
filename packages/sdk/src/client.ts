import { CortexaSdkConfig } from "./types";

// ─── Base HTTP Client ─────────────────────────────────────────────────────────

export class CortexaClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: CortexaSdkConfig = {}) {
    this.baseUrl = config.baseUrl ?? "";
    this.headers = {
      "Content-Type": "application/json",
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
    };
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[CortexaSDK] GET ${path} failed (${res.status}): ${body}`);
    }
    return res.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`[CortexaSDK] POST ${path} failed (${res.status}): ${errBody}`);
    }
    return res.json() as Promise<T>;
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "PATCH",
      headers: this.headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`[CortexaSDK] PATCH ${path} failed (${res.status}): ${errBody}`);
    }
    return res.json() as Promise<T>;
  }

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers: this.headers,
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`[CortexaSDK] DELETE ${path} failed (${res.status}): ${errBody}`);
    }
    return res.json() as Promise<T>;
  }
}
