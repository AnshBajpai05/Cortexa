import { z } from "zod";
import { NodeManifest } from "../types";
declare const DecisionNodeConfig: z.ZodObject<{
    model: z.ZodDefault<z.ZodEnum<["moonshotai/kimi-k2-instruct", "z-ai/glm4.7"]>>;
    decisionType: z.ZodDefault<z.ZodEnum<["pipeline_path", "model_selection", "tool_selection", "content_strategy"]>>;
    maxOptions: z.ZodDefault<z.ZodNumber>;
    maxIterations: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7";
    decisionType?: "pipeline_path" | "model_selection" | "tool_selection" | "content_strategy";
    maxOptions?: number;
    maxIterations?: number;
}, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7";
    decisionType?: "pipeline_path" | "model_selection" | "tool_selection" | "content_strategy";
    maxOptions?: number;
    maxIterations?: number;
}>;
export type DecisionNodeConfigType = z.infer<typeof DecisionNodeConfig>;
export declare const decisionNode: NodeManifest;
export {};
