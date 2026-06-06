import { z } from "zod";
import { NodeManifest } from "../types";
declare const QANodeConfig: z.ZodObject<{
    model: z.ZodDefault<z.ZodEnum<["z-ai/glm4.7", "moonshotai/kimi-k2-instruct", "meta/llama-3.1-8b-instruct"]>>;
    rubric: z.ZodDefault<z.ZodString>;
    threshold: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7" | "meta/llama-3.1-8b-instruct";
    rubric?: string;
    threshold?: number;
}, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7" | "meta/llama-3.1-8b-instruct";
    rubric?: string;
    threshold?: number;
}>;
export type QANodeConfigType = z.infer<typeof QANodeConfig>;
export declare const qaNode: NodeManifest;
export {};
