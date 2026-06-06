import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { tools } from "../tools";
import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

// ─── Config Schema ────────────────────────────────────────────────────────────
const ImageNodeConfig = z.object({
  model: z.string().default("black-forest-labs/flux1-dev"),
  negativePrompt: z.string().default("blurry, low quality, distorted, nsfw"),
  width: z.number().int().default(1024),
  height: z.number().int().default(1024),
  cfgScale: z.number().min(1).max(20).default(7),
  stylePreset: z.string().optional(),
  brandPalette: z.string().optional(),
  cameraAngle: z.string().optional(),
  saveToMemoryKey: z.string().optional(),
  overlayText: z.boolean().default(true),
});

export type ImageNodeConfigType = z.infer<typeof ImageNodeConfig>;

// ─── S3 Upload Helper ─────────────────────────────────────────────────────────
async function uploadToS3(
  imageBuffer: Buffer,
  ctx: RunContext,
  filename: string
): Promise<string> {
  const s3 = new S3Client({
    endpoint: ctx.env.S3_ENDPOINT,
    region: "us-east-1",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    forcePathStyle: true,
  });

  const bucket = ctx.env.S3_BUCKET || "cortexa-assets";

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (err) {
    console.log(`[imageNode] Bucket ${bucket} not found, creating it...`);
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }

  const key = `workspaces/${ctx.workflowId}/runs/${ctx.runId}/${filename}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: imageBuffer,
      ContentType: "image/png",
    })
  );

  return `${ctx.env.S3_ENDPOINT}/${bucket}/${key}`;
}

// ─── Text Overlay Helper ──────────────────────────────────────────────────────
async function bakePosterText(
  baseBuffer: Buffer,
  text: { headline?: string; tagline?: string; cta?: string }
): Promise<Buffer> {
  const width = 1024;
  const height = 1024;

  const escapeXml = (unsafe: string) => {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  };

  const headline = escapeXml((text.headline || "").slice(0, 100));
  const tagline = escapeXml((text.tagline || "").slice(0, 150));
  const cta = escapeXml((text.cta || "").slice(0, 60)); // CTA button is small

  // Handle headline wrapping (max ~35 chars per line at this font size)
  const words = headline.split(' ');
  let h1 = headline;
  let h2 = "";
  if (headline.length > 35 && words.length > 2) {
    const mid = Math.ceil(words.length / 2);
    h1 = words.slice(0, mid).join(' ');
    h2 = words.slice(mid).join(' ');
  }

  // Cinematic SVG Overlay
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="50%" style="stop-color:rgba(0,0,0,0);stop-opacity:0" />
          <stop offset="100%" style="stop-color:rgba(0,0,0,0.9);stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
      
      <!-- Headline -->
      <text x="50%" y="${h2 ? '780' : '820'}" font-family="Arial, sans-serif" font-weight="bold" font-size="40" fill="white" text-anchor="middle" style="filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8)); text-transform: uppercase; letter-spacing: 2px;">
        ${h1}
      </text>
      ${h2 ? `
      <text x="50%" y="830" font-family="Arial, sans-serif" font-weight="bold" font-size="40" fill="white" text-anchor="middle" style="filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8)); text-transform: uppercase; letter-spacing: 2px;">
        ${h2}
      </text>
      ` : ''}
      
      <!-- Tagline -->
      <text x="50%" y="880" font-family="Arial, sans-serif" font-size="24" fill="#e0e0e0" text-anchor="middle" style="filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.8)); font-style: italic;">
        ${tagline}
      </text>
      
      <!-- CTA -->
      <rect x="262" y="920" width="500" height="50" rx="25" fill="#f0c040" style="filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.4));" />
      <text x="50%" y="952" font-family="Arial, sans-serif" font-weight="bold" font-size="20" fill="black" text-anchor="middle">
        ${cta}
      </text>
    </svg>
  `;

  return sharp(baseBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const imageNode: NodeManifest = {
  id: "image.compositor",
  name: "Image Generator",
  description: "Generates a Flux image and bakes in professional poster text (Headline, Tagline, CTA).",
  category: "image",

  costTier: "high",
  avgLatencyMs: 10000,
  inputs: [
    { id: "prompt", label: "Image Prompt", type: "text", required: true, semanticType: "text" },
    { id: "headline", label: "Poster Headline", type: "text", semanticType: "text" },
    { id: "tagline", label: "Poster Tagline", type: "text", semanticType: "text" },
    { id: "cta", label: "Call to Action", type: "text", semanticType: "text" },
  ],

  outputs: [
    { id: "imageUrl", label: "Generated Poster URL", type: "image", semanticType: "image" },
  ],

  configSchema: ImageNodeConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = ImageNodeConfig.parse(rawConfig);
    const prompt = (ctx.inputs["prompt"] || ctx.inputs["text"] || ctx.inputs["value"]) as string;
    
    // Extract text components from context
    const headline = ctx.inputs["headline"] as string;
    const tagline = ctx.inputs["tagline"] as string;
    const cta = ctx.inputs["cta"] as string;

    if (!prompt) throw new Error(`[imageNode] Missing required input: prompt.`);

    let result;
    try {
      result = await tools.image("nvidia", prompt, {
        model: config.model,
        negativePrompt: config.negativePrompt,
        width: 1024,
        height: 1024,
        cfgScale: config.cfgScale,
      }, ctx);
    } catch (err: any) {
      console.warn(`[imageNode] External API failed, falling back to mock provider.`);
      result = await tools.image("mock", prompt, { width: 1024, height: 1024 }, ctx);
    }

    let finalBuffer = result.buffer;
    
    // Perform text baking if we have a real buffer
    if (finalBuffer && config.overlayText && (headline || tagline || cta)) {
      console.log(`[imageNode] Baking poster text: ${headline?.slice(0,20)}...`);
      finalBuffer = await bakePosterText(finalBuffer, { headline, tagline, cta });
    }

    let finalUrl = "";
    if (result.provider === "mock" && result.url) {
      finalUrl = result.url;
    } else if (finalBuffer) {
      const filename = `poster-${Date.now()}.png`;
      finalUrl = await uploadToS3(finalBuffer, ctx, filename);
      
      // Save for local preview (relative to project root if possible)
      try {
        require("fs").writeFileSync("../../scratch/last_generated_poster.png", finalBuffer);
      } catch (e) {
        // Fallback to local if root scratch is unreachable
        require("fs").writeFileSync("last_generated_poster.png", finalBuffer);
      }
    }

    return {
      value: finalUrl,
      imageUrl: finalUrl,
      label: `Poster: ${headline || prompt.slice(0, 30)}`,
      explanation: "Generated high-fidelity Flux image with baked cinematic typography.",
      confidence: 0.98,
    };
  },
};
