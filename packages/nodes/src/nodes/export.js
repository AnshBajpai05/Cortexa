"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportNode = void 0;
const zod_1 = require("zod");
const client_s3_1 = require("@aws-sdk/client-s3");
const ExportNodeConfig = zod_1.z.object({
    format: zod_1.z.enum(["markdown", "presentation_data"]).default("markdown"),
    filename: zod_1.z.string().optional(),
});
async function uploadToS3(buffer, contentType, ctx, filename) {
    const s3 = new client_s3_1.S3Client({
        endpoint: ctx.env.S3_ENDPOINT,
        region: "us-east-1",
        credentials: {
            accessKeyId: "test",
            secretAccessKey: "test",
        },
        forcePathStyle: true,
    });
    const key = `workspaces/${ctx.workflowId}/runs/${ctx.runId}/exports/${filename}`;
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: ctx.env.S3_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
    }));
    return `${ctx.env.S3_ENDPOINT}/${ctx.env.S3_BUCKET}/${key}`;
}
exports.exportNode = {
    id: "output.exporter",
    name: "Export Artifact",
    description: "Transforms upstream content into a structured, downloadable artifact (Markdown or JSON Presentation Data) and persists it.",
    category: "output",
    costTier: "low",
    avgLatencyMs: 500,
    inputs: [
        {
            id: "content",
            label: "Content to Export",
            type: "any",
            required: true,
        },
    ],
    outputs: [
        { id: "fileUrl", label: "Download URL", type: "text", semanticType: "text" },
        { id: "structuredData", label: "Structured Data", type: "json", semanticType: "json" },
    ],
    configSchema: ExportNodeConfig,
    run: async (ctx, rawConfig) => {
        const config = ExportNodeConfig.parse(rawConfig);
        const content = ctx.inputs["content"];
        if (!content) {
            throw new Error(`[exportNode] Missing required input: content`);
        }
        let fileBuffer;
        let mimeType;
        let extension;
        let structuredData = null;
        if (config.format === "presentation_data") {
            mimeType = "application/json";
            extension = "json";
            try {
                structuredData = typeof content === "string" ? JSON.parse(content) : content;
                if (!structuredData.slides) {
                    structuredData = { title: "Presentation", slides: [{ title: "Slide 1", bullets: [content] }] };
                }
            }
            catch (e) {
                structuredData = {
                    title: "Exported Presentation",
                    slides: [
                        { title: "Slide 1", bullets: [typeof content === "string" ? content.substring(0, 100) : "Complex content"] }
                    ]
                };
            }
            fileBuffer = Buffer.from(JSON.stringify(structuredData, null, 2), "utf-8");
        }
        else {
            mimeType = "text/markdown";
            extension = "md";
            const markdownContent = typeof content === "string" ? content : JSON.stringify(content, null, 2);
            fileBuffer = Buffer.from(markdownContent, "utf-8");
        }
        const filename = config.filename ? `${config.filename}.${extension}` : `export-${Date.now()}.${extension}`;
        const fileUrl = await uploadToS3(fileBuffer, mimeType, ctx, filename);
        return {
            value: fileUrl,
            fileUrl,
            structuredData,
            mimeType,
            filename,
            label: `Exported ${filename}`,
            explanation: `Successfully exported content as ${config.format} and persisted to LocalStack S3 at ${fileUrl}.`,
            confidence: 1.0
        };
    },
};
//# sourceMappingURL=export.js.map