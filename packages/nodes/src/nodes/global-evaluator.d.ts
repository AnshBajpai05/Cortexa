import { z } from "zod";
import { NodeManifest } from "../types";
declare const GlobalEvaluatorNodeConfig: z.ZodObject<{
    model: z.ZodDefault<z.ZodEnum<["moonshotai/kimi-k2-instruct", "z-ai/glm4.7", "meta/llama-3.1-8b-instruct"]>>;
    globalRubric: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7" | "meta/llama-3.1-8b-instruct";
    globalRubric?: string;
}, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7" | "meta/llama-3.1-8b-instruct";
    globalRubric?: string;
}>;
export type GlobalEvaluatorNodeConfigType = z.infer<typeof GlobalEvaluatorNodeConfig>;
export declare const globalEvaluatorNode: NodeManifest;
export {};
