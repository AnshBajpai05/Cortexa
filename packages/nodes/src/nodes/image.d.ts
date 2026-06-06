import { z } from "zod";
import { NodeManifest } from "../types";
declare const ImageNodeConfig: z.ZodObject<{
    model: z.ZodDefault<z.ZodString>;
    negativePrompt: z.ZodDefault<z.ZodString>;
    width: z.ZodDefault<z.ZodNumber>;
    height: z.ZodDefault<z.ZodNumber>;
    cfgScale: z.ZodDefault<z.ZodNumber>;
    stylePreset: z.ZodOptional<z.ZodString>;
    brandPalette: z.ZodOptional<z.ZodString>;
    cameraAngle: z.ZodOptional<z.ZodString>;
    saveToMemoryKey: z.ZodOptional<z.ZodString>;
    overlayText: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    model?: string;
    saveToMemoryKey?: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    cfgScale?: number;
    stylePreset?: string;
    brandPalette?: string;
    cameraAngle?: string;
    overlayText?: boolean;
}, {
    model?: string;
    saveToMemoryKey?: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    cfgScale?: number;
    stylePreset?: string;
    brandPalette?: string;
    cameraAngle?: string;
    overlayText?: boolean;
}>;
export type ImageNodeConfigType = z.infer<typeof ImageNodeConfig>;
export declare const imageNode: NodeManifest;
export {};
