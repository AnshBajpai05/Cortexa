import { z } from "zod";
import { NodeManifest } from "../types";
declare const SafetyNodeConfig: z.ZodObject<{
    failOnUnsafe: z.ZodDefault<z.ZodBoolean>;
    checkLabel: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    failOnUnsafe?: boolean;
    checkLabel?: string;
}, {
    failOnUnsafe?: boolean;
    checkLabel?: string;
}>;
export type SafetyNodeConfigType = z.infer<typeof SafetyNodeConfig>;
export declare const safetyNode: NodeManifest;
export {};
