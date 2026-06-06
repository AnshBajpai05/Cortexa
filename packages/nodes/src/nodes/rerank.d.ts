import { z } from "zod";
import { NodeManifest } from "../types";
declare const RerankNodeConfig: z.ZodObject<{
    topN: z.ZodDefault<z.ZodNumber>;
    minScore: z.ZodDefault<z.ZodNumber>;
    model: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    model?: string;
    topN?: number;
    minScore?: number;
}, {
    model?: string;
    topN?: number;
    minScore?: number;
}>;
export type RerankNodeConfigType = z.infer<typeof RerankNodeConfig>;
export declare const rerankNode: NodeManifest;
export {};
