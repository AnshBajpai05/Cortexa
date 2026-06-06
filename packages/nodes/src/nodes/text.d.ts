import { z } from "zod";
import { NodeManifest } from "../types";
declare const TextNodeConfig: z.ZodObject<{
    systemPrompt: z.ZodDefault<z.ZodString>;
    model: z.ZodDefault<z.ZodEnum<["moonshotai/kimi-k2-instruct", "z-ai/glm4.7", "meta/llama-3.1-8b-instruct"]>>;
    maxTokens: z.ZodDefault<z.ZodNumber>;
    temperature: z.ZodDefault<z.ZodNumber>;
    role: z.ZodOptional<z.ZodString>;
    goal: z.ZodOptional<z.ZodString>;
    saveToMemoryKey: z.ZodOptional<z.ZodString>;
    requireContext: z.ZodDefault<z.ZodEnum<["hard", "soft", "none"]>>;
    jsonSchema: z.ZodOptional<z.ZodString>;
    prompt: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7" | "meta/llama-3.1-8b-instruct";
    temperature?: number;
    systemPrompt?: string;
    maxTokens?: number;
    role?: string;
    goal?: string;
    saveToMemoryKey?: string;
    requireContext?: "hard" | "soft" | "none";
    jsonSchema?: string;
    prompt?: string;
}, {
    model?: "moonshotai/kimi-k2-instruct" | "z-ai/glm4.7" | "meta/llama-3.1-8b-instruct";
    temperature?: number;
    systemPrompt?: string;
    maxTokens?: number;
    role?: string;
    goal?: string;
    saveToMemoryKey?: string;
    requireContext?: "hard" | "soft" | "none";
    jsonSchema?: string;
    prompt?: string;
}>;
export type TextNodeConfigType = z.infer<typeof TextNodeConfig>;
export declare const textNode: NodeManifest;
export {};
