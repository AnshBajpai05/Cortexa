import { z } from "zod";
import { NodeManifest } from "../types";
declare const OCRNodeConfig: z.ZodObject<{
    outputMode: z.ZodDefault<z.ZodEnum<["text_only", "full_structured"]>>;
}, "strip", z.ZodTypeAny, {
    outputMode?: "text_only" | "full_structured";
}, {
    outputMode?: "text_only" | "full_structured";
}>;
export type OCRNodeConfigType = z.infer<typeof OCRNodeConfig>;
export declare const ocrNode: NodeManifest;
export {};
