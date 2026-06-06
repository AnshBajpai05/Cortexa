import { z } from "zod";
import { NodeManifest } from "../types";
declare const ExportNodeConfig: z.ZodObject<{
    format: z.ZodDefault<z.ZodEnum<["markdown", "presentation_data"]>>;
    filename: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    format?: "markdown" | "presentation_data";
    filename?: string;
}, {
    format?: "markdown" | "presentation_data";
    filename?: string;
}>;
export type ExportNodeConfigType = z.infer<typeof ExportNodeConfig>;
export declare const exportNode: NodeManifest;
export {};
