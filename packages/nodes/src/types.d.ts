import { z } from "zod";
export interface RunContext {
    runId: string;
    workflowId: string;
    nodeId: string;
    attempt: number;
    inputs: Record<string, unknown>;
    env: {
        GROQ_API_KEY: string;
        HUGGINGFACE_API_KEY: string;
        S3_ENDPOINT: string;
        S3_BUCKET: string;
        NVIDIA_LLM_KEY: string;
        NVIDIA_GLM_KEY: string;
        NVIDIA_VISION_KEY: string;
        NVIDIA_EMBED_KEY: string;
        NVIDIA_BGE_KEY: string;
        NVIDIA_RERANK_KEY: string;
        NVIDIA_PALIGEMMA_KEY: string;
        NVIDIA_OCR_KEY: string;
        NVIDIA_SAFETY_KEY: string;
        NVIDIA_IMAGE_KEY: string;
        REDIS_HOST: string;
        REDIS_PORT: number;
        API_URL: string;
    };
}
export interface NodeOutput {
    value?: unknown;
    assetUrl?: string;
    label?: string;
    explanation?: string;
    confidence?: number;
    [key: string]: any;
}
export type SemanticType = "text" | "json" | "image" | "decision";
export interface PortDefinition {
    id: string;
    label: string;
    type: "text" | "image" | "json" | "any";
    required?: boolean;
    semanticType?: SemanticType;
}
export interface NodeManifest {
    id: string;
    name: string;
    description: string;
    category: "text" | "image" | "logic" | "input" | "output" | "safety" | "vision" | "memory";
    costTier?: "low" | "medium" | "high";
    avgLatencyMs?: number;
    inputs: PortDefinition[];
    outputs: PortDefinition[];
    configSchema: z.ZodTypeAny;
    run: (ctx: RunContext, config: unknown) => Promise<NodeOutput>;
}
export type NodeRegistry = Map<string, NodeManifest>;
