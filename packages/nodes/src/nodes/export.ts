import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// ─── Config Schema ────────────────────────────────────────────────────────────
const ExportNodeConfig = z.object({
  format: z.enum(["markdown", "presentation_data"]).default("markdown"),
  filename: z.string().optional(),
});

export type ExportNodeConfigType = z.infer<typeof ExportNodeConfig>;

// ─── S3 Upload Helper ─────────────────────────────────────────────────────────
async function uploadToS3(
  buffer: Buffer,
  contentType: string,
  ctx: RunContext,
  filename: string
): Promise<string> {
  const s3 = new S3Client({
    endpoint: ctx.env.S3_ENDPOINT, // http://localhost:4566 for LocalStack
    region: "us-east-1",
    credentials: {
      accessKeyId: "test",
      secretAccessKey: "test",
    },
    forcePathStyle: true, // required for LocalStack
  });

  const key = `workspaces/${ctx.workflowId}/runs/${ctx.runId}/exports/${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: ctx.env.S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  // Return a LocalStack-compatible public URL
  return `${ctx.env.S3_ENDPOINT}/${ctx.env.S3_BUCKET}/${key}`;
}

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const exportNode: NodeManifest = {
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

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = ExportNodeConfig.parse(rawConfig);
    const content = ctx.inputs["content"];

    if (!content) {
      throw new Error(`[exportNode] Missing required input: content`);
    }

    let fileBuffer: Buffer;
    let mimeType: string;
    let extension: string;
    let structuredData: any = null;

    if (config.format === "presentation_data") {
      mimeType = "application/json";
      extension = "json";
      
      // Attempt to parse content as JSON if it's a string, or use directly if it's already an object
      try {
        structuredData = typeof content === "string" ? JSON.parse(content) : content;
        // Ensure it matches presentation schema roughly (if the upstream node did its job)
        if (!structuredData.slides) {
           structuredData = { title: "Presentation", slides: [{ title: "Slide 1", bullets: [content] }] };
        }
      } catch (e) {
        // Fallback to wrapping the text in a simple slide structure
        structuredData = {
          title: "Exported Presentation",
          slides: [
            { title: "Slide 1", bullets: [typeof content === "string" ? content.substring(0, 100) : "Complex content"] }
          ]
        };
      }
      fileBuffer = Buffer.from(JSON.stringify(structuredData, null, 2), "utf-8");

    } else {
      // Default to Markdown
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
      confidence: 1.0 // Export nodes don't generate content, they just format it, so confidence is absolute.
    };
  },
};
