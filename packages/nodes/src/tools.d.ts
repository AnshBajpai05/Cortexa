import { RunContext } from "./types";
export interface ModelProfile {
    id: string;
    costTier: "low" | "medium" | "high";
    avgLatencyMs: number;
    maxTokens: number;
    strengths: string[];
}
export declare const MODEL_PROFILES: Record<string, ModelProfile>;
export declare function getModelProfile(modelId: string): ModelProfile | undefined;
export type TaskType = "reasoning" | "qa" | "agent" | "decision" | "fast" | "safety" | "default";
export interface RouteOptions {
    task: TaskType;
    preference?: "fast" | "quality" | "balanced";
}
export declare function resolveTextModel(taskOrOptions: TaskType | RouteOptions, ctx?: RunContext): string;
export interface LLMOptions {
    task?: TaskType;
    preference?: "fast" | "quality" | "balanced";
    model?: string;
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
}
export interface EmbedOptions {
    model?: string;
    inputType?: "query" | "passage";
}
export interface RerankOptions {
    model?: string;
    topN?: number;
}
export interface VisionOptions {
    model?: string;
    maxTokens?: number;
}
export interface ImageOptions {
    model?: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    numInferenceSteps?: number;
    cfgScale?: number;
}
export declare function callNimStructured<T>(prompt: string, options: LLMOptions, ctx: RunContext, validate: (raw: string) => {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
}, maxRetries?: number): Promise<{
    data: T;
    raw: string;
    attempts: number;
}>;
export declare const tools: {
    llm: (provider: "nvidia" | "groq" | "mock", prompt: string, options: LLMOptions, ctx: RunContext) => Promise<string>;
    embed: (texts: string[], options: EmbedOptions, ctx: RunContext) => Promise<number[][]>;
    rerank: (query: string, passages: string[], options: RerankOptions, ctx: RunContext) => Promise<{
        index: number;
        relevance_score: number;
    }[]>;
    vision: (imageBase64: string, prompt: string, options: VisionOptions, ctx: RunContext) => Promise<string>;
    ocr: (imageBase64: string, ctx: RunContext) => Promise<{
        text: string;
        bboxes: unknown[];
    }>;
    safety: (content: string, ctx: RunContext) => Promise<{
        safe: boolean;
        category: string;
        raw: string;
    }>;
    image: (provider: "nvidia" | "mock", prompt: string, options: ImageOptions, ctx: RunContext) => Promise<{
        buffer: Buffer | null;
        url: string | null;
        provider: string;
    }>;
};
