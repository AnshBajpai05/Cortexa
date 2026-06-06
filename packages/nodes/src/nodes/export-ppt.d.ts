import { z } from "zod";
import { NodeManifest } from "../types";
declare const ExportPptConfig: z.ZodObject<{
    filename: z.ZodOptional<z.ZodString>;
    templatePath: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    filename?: string;
    templatePath?: string;
}, {
    filename?: string;
    templatePath?: string;
}>;
export type ExportPptConfigType = z.infer<typeof ExportPptConfig>;
export declare const exportPptNode: NodeManifest;
export {};
