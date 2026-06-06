import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { tools } from "../tools";

// ─── Config Schema ────────────────────────────────────────────────────────────
const OCRNodeConfig = z.object({
  /** Whether to return raw text only, or the full structured bboxes object */
  outputMode: z.enum(["text_only", "full_structured"]).default("text_only"),
});

export type OCRNodeConfigType = z.infer<typeof OCRNodeConfig>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const ocrNode: NodeManifest = {
  id: "vision.ocr",
  name: "OCR Extractor",
  description:
    "Extracts text and bounding boxes from an image using baidu/paddleocr. Ideal for strict document, table, and invoice parsing.",
  category: "vision",

  costTier: "low",
  avgLatencyMs: 2000,
  inputs: [
    {
      id: "image_base64",
      label: "Image (Base64)",
      type: "text",
      required: true,
    },
  ],

  outputs: [
    { id: "extracted_text", label: "Extracted Text", type: "text", semanticType: "text" },
    { id: "bboxes", label: "Bounding Boxes (JSON)", type: "json", semanticType: "json" },
  ],

  configSchema: OCRNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = OCRNodeConfig.parse(rawConfig);
    const imageBase64 = ctx.inputs["image_base64"] as string;

    if (!imageBase64) {
      throw new Error(`[ocrNode] Missing required input: image_base64 (runId=${ctx.runId})`);
    }

    // Strip data URI prefix if present (e.g., "data:image/png;base64,...")
    const cleanBase64 = imageBase64.includes(",")
      ? imageBase64.split(",")[1]
      : imageBase64;

    console.log(`[ocrNode] Calling PaddleOCR on image (${cleanBase64.length} base64 chars)...`);

    const result = await tools.ocr(cleanBase64, ctx);

    const charCount = result.text.length;
    const bboxCount = result.bboxes.length;

    return {
      value: config.outputMode === "full_structured" ? result : result.text,
      extracted_text: result.text,
      bboxes: result.bboxes,
      label: `OCR: ${charCount} chars, ${bboxCount} regions`,
      explanation: `PaddleOCR extracted ${charCount} characters across ${bboxCount} bounding box regions from the provided image.`,
      confidence: charCount > 0 ? 0.95 : 0.5,
    };
  },
};
