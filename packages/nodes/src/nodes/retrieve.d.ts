import { z } from "zod";
import { NodeManifest } from "../types";
declare const RetrieveNodeConfig: z.ZodObject<{
    topK: z.ZodDefault<z.ZodNumber>;
    embeddingModel: z.ZodDefault<z.ZodEnum<["nvidia/nv-embed-v1", "baai/bge-m3"]>>;
}, "strip", z.ZodTypeAny, {
    topK?: number;
    embeddingModel?: "nvidia/nv-embed-v1" | "baai/bge-m3";
}, {
    topK?: number;
    embeddingModel?: "nvidia/nv-embed-v1" | "baai/bge-m3";
}>;
export type RetrieveNodeConfigType = z.infer<typeof RetrieveNodeConfig>;
export declare const retrieveNode: NodeManifest;
export {};
