import { z } from "zod";
import { NodeManifest } from "../types";
declare const OrchestratorNodeConfig: z.ZodObject<{
    model: z.ZodDefault<z.ZodEnum<["z-ai/glm4.7", "moonshotai/kimi-k2-instruct", "meta/llama-3.1-8b-instruct"]>>;
}, "strip", z.ZodTypeAny, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7" | "meta/llama-3.1-8b-instruct";
}, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7" | "meta/llama-3.1-8b-instruct";
}>;
export type OrchestratorNodeConfigType = z.infer<typeof OrchestratorNodeConfig>;
export declare const orchestratorNode: NodeManifest;
export {};
