"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ocrNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const OCRNodeConfig = zod_1.z.object({
    outputMode: zod_1.z.enum(["text_only", "full_structured"]).default("text_only"),
});
exports.ocrNode = {
    id: "vision.ocr",
    name: "OCR Extractor",
    description: "Extracts text and bounding boxes from an image using baidu/paddleocr. Ideal for strict document, table, and invoice parsing.",
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
    run: async (ctx, rawConfig) => {
        const config = OCRNodeConfig.parse(rawConfig);
        const imageBase64 = ctx.inputs["image_base64"];
        if (!imageBase64) {
            throw new Error(`[ocrNode] Missing required input: image_base64 (runId=${ctx.runId})`);
        }
        const cleanBase64 = imageBase64.includes(",")
            ? imageBase64.split(",")[1]
            : imageBase64;
        console.log(`[ocrNode] Calling PaddleOCR on image (${cleanBase64.length} base64 chars)...`);
        const result = await tools_1.tools.ocr(cleanBase64, ctx);
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
//# sourceMappingURL=ocr.js.map