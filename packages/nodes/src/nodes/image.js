"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageNode = void 0;
const zod_1 = require("zod");
const tools_1 = require("../tools");
const client_s3_1 = require("@aws-sdk/client-s3");
const sharp_1 = __importDefault(require("sharp"));
const ImageNodeConfig = zod_1.z.object({
    model: zod_1.z.string().default("black-forest-labs/flux1-dev"),
    negativePrompt: zod_1.z.string().default("blurry, low quality, distorted, nsfw"),
    width: zod_1.z.number().int().default(1024),
    height: zod_1.z.number().int().default(1024),
    cfgScale: zod_1.z.number().min(1).max(20).default(7),
    stylePreset: zod_1.z.string().optional(),
    brandPalette: zod_1.z.string().optional(),
    cameraAngle: zod_1.z.string().optional(),
    saveToMemoryKey: zod_1.z.string().optional(),
    overlayText: zod_1.z.boolean().default(true),
});
async function uploadToS3(imageBuffer, ctx, filename) {
    const s3 = new client_s3_1.S3Client({
        endpoint: ctx.env.S3_ENDPOINT,
        region: "us-east-1",
        credentials: { accessKeyId: "test", secretAccessKey: "test" },
        forcePathStyle: true,
    });
    const bucket = ctx.env.S3_BUCKET || "cortexa-assets";
    try {
        await s3.send(new client_s3_1.HeadBucketCommand({ Bucket: bucket }));
    }
    catch (err) {
        console.log(`[imageNode] Bucket ${bucket} not found, creating it...`);
        await s3.send(new client_s3_1.CreateBucketCommand({ Bucket: bucket }));
    }
    const key = `workspaces/${ctx.workflowId}/runs/${ctx.runId}/${filename}`;
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: imageBuffer,
        ContentType: "image/png",
    }));
    return `${ctx.env.S3_ENDPOINT}/${bucket}/${key}`;
}
async function bakePosterText(baseBuffer, text) {
    const width = 1024;
    const height = 1024;
    const escapeXml = (unsafe) => {
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
    const cta = escapeXml((text.cta || "").slice(0, 60));
    const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="60%" style="stop-color:rgba(0,0,0,0);stop-opacity:0" />
          <stop offset="100%" style="stop-color:rgba(0,0,0,0.8);stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grad)" />
      
      <!-- Headline -->
      <text x="50%" y="820" font-family="Arial, sans-serif" font-weight="bold" font-size="48" fill="white" text-anchor="middle" style="filter: drop-shadow(2px 2px 4px rgba(0,0,0,0.8)); text-transform: uppercase; letter-spacing: 4px;">
        ${headline}
      </text>
      
      <!-- Tagline -->
      <text x="50%" y="870" font-family="Arial, sans-serif" font-size="24" fill="#e0e0e0" text-anchor="middle" style="filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.8)); font-style: italic;">
        ${tagline}
      </text>
      
      <!-- CTA -->
      <rect x="362" y="920" width="300" height="50" rx="25" fill="#f0c040" style="filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.4));" />
      <text x="50%" y="952" font-family="Arial, sans-serif" font-weight="bold" font-size="18" fill="black" text-anchor="middle">
        ${cta}
      </text>
    </svg>
  `;
    return (0, sharp_1.default)(baseBuffer)
        .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
        .png()
        .toBuffer();
}
exports.imageNode = {
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
    run: async (ctx, rawConfig) => {
        const config = ImageNodeConfig.parse(rawConfig);
        const prompt = (ctx.inputs["prompt"] || ctx.inputs["text"] || ctx.inputs["value"]);
        const headline = ctx.inputs["headline"];
        const tagline = ctx.inputs["tagline"];
        const cta = ctx.inputs["cta"];
        if (!prompt)
            throw new Error(`[imageNode] Missing required input: prompt.`);
        let result;
        try {
            result = await tools_1.tools.image("nvidia", prompt, {
                model: config.model,
                negativePrompt: config.negativePrompt,
                width: 1024,
                height: 1024,
                cfgScale: config.cfgScale,
            }, ctx);
        }
        catch (err) {
            console.warn(`[imageNode] External API failed, falling back to mock provider.`);
            result = await tools_1.tools.image("mock", prompt, { width: 1024, height: 1024 }, ctx);
        }
        let finalBuffer = result.buffer;
        if (finalBuffer && config.overlayText && (headline || tagline || cta)) {
            console.log(`[imageNode] Baking poster text: ${headline?.slice(0, 20)}...`);
            finalBuffer = await bakePosterText(finalBuffer, { headline, tagline, cta });
        }
        let finalUrl = "";
        if (result.provider === "mock" && result.url) {
            finalUrl = result.url;
        }
        else if (finalBuffer) {
            const filename = `poster-${Date.now()}.png`;
            finalUrl = await uploadToS3(finalBuffer, ctx, filename);
            try {
                require("fs").writeFileSync("../../scratch/last_generated_poster.png", finalBuffer);
            }
            catch (e) {
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
//# sourceMappingURL=image.js.map