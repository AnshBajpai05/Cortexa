import { z } from "zod";
import { NodeManifest, RunContext, NodeOutput } from "../types";
import { extractFlow } from "../utils/flowExtractor";
import { buildDiagramSpec } from "../utils/diagramBuilder";

// ─── Config Schema ────────────────────────────────────────────────────────────
const ExportPptConfig = z.object({
  filename: z.string().optional(),
  templatePath: z.string().optional(),
});

export type ExportPptConfigType = z.infer<typeof ExportPptConfig>;

// ─── Node Manifest ────────────────────────────────────────────────────────────
export const exportPptNode: NodeManifest = {
  id: "output.ppt",
  name: "Export PowerPoint",
  description: "Transforms presentation JSON into a professional PowerPoint file using a template and a Python renderer.",
  category: "output",

  costTier: "low",
  avgLatencyMs: 2000,
  inputs: [
    {
      id: "presentation_json",
      label: "Presentation JSON",
      type: "json",
      required: true,
    },
  ],

  outputs: [
    { id: "fileUrl", label: "PPT Download URL", type: "text", semanticType: "text" },
    { id: "filename", label: "Filename", type: "text", semanticType: "text" },
  ],

  configSchema: ExportPptConfig,

  run: async (ctx: RunContext, rawConfig: unknown): Promise<NodeOutput> => {
    const config = ExportPptConfig.parse(rawConfig);
    const presentationData = ctx.inputs["presentation_json"];

    if (!presentationData) {
      throw new Error(`[exportPptNode] Missing required input: presentation_json`);
    }

    // ─── Auto-Detection & Diagram Injection ───
    const slides = (presentationData as any).slides || [];
    const textContext = slides.map((s: any) => s.title + " " + (s.bullets || []).join(" ")).join("\n");
    
    const componentCount = slides.filter((s: any) => s.semantic_role === "component" || s.title.toLowerCase().includes("layer")).length;
    const flowVerbs = ["process", "route", "normalize", "classify", "detect", "store", "extract", "validate"];
    const hasFlowVerbs = flowVerbs.some((v) => textContext.toLowerCase().includes(v));

    const hasExplicitDiagram = textContext.toLowerCase().includes("architecture diagram");
    const hasSequentialComponents = textContext.toLowerCase().includes("pipeline") || textContext.toLowerCase().includes("flow");

    const isArchitecture = hasExplicitDiagram || hasSequentialComponents || (componentCount > 4 && hasFlowVerbs);

    if (isArchitecture) {
      console.log(`[exportPptNode] Auto-detected architecture diagram intent. Extracting flow...`);
      const graph = await extractFlow(textContext, ctx);
      
      if (graph && graph.mermaid_code) {
        const spec = buildDiagramSpec(graph);
        
        // Find injection index: after "System Overview", "Architecture", or "Approach"
        let insertIndex = 2; // Default fallback
        for (let i = 0; i < slides.length; i++) {
          const t = slides[i].title?.toLowerCase() || "";
          if (t.includes("system overview") || t.includes("architecture") || t.includes("approach") || t.includes("design")) {
            insertIndex = i + 1;
            // keep looking to find the LAST matching overview slide, or break? Let's break.
            break;
          }
        }

        const diagramSlide = {
          type: "diagram",
          title: "System Architecture & Processing Flow",
          semantic_role: "architecture",
          diagram: {
            source: "auto",
            render_mode: "mermaid", // using mermaid render mode
            spec: spec
          }
        };

        slides.splice(insertIndex, 0, diagramSlide);
        console.log(`[exportPptNode] Injected diagram slide at index ${insertIndex}.`);
      }
    }
    // ─── End Diagram Injection ───

    const pptWorkerUrl = process.env.PPT_WORKER_URL || "http://localhost:8000";
    const templatePath = config.templatePath || process.env.PPT_TEMPLATE_PATH || "F:/AMRITA ALL SEMESTER/projects/Cortexa/scratch/template.pptx";

    console.log(`[exportPptNode] Sending request to PPT worker at ${pptWorkerUrl}`);

    try {
      const response = await fetch(`${pptWorkerUrl}/generate-ppt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: (presentationData as any).title || "Cortexa Presentation",
          slides: (presentationData as any).slides || [],
          template_path: templatePath,
          output_filename: config.filename,
          nvidia_key: ctx.env.NVIDIA_LLM_KEY,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`PPT Worker failed: ${JSON.stringify(errorData)}`);
      }

      const result = (await response.json()) as { 
        fileUrl: string; 
        filename: string; 
        explanation?: string;
        metrics?: Record<string, number>;
      };

      let metricsSummary = "";
      if (result.metrics) {
        metricsSummary = "\n\n⏱️ Performance Metrics:\n" +
          `- Classification: ${result.metrics.classify_and_reorder}s\n` +
          `- Story Arc: ${result.metrics.validate_story_arc}s\n` +
          `- Enrichment: ${result.metrics.interpret_presentation}s\n` +
          `- Normalization: ${result.metrics.normalize_presentation}s\n` +
          `- Rendering: ${result.metrics.render_ppt}s\n` +
          `- Total Worker Time: ${result.metrics.total_worker_time?.toFixed(3)}s`;
      }

      return {
        value: result.fileUrl,
        fileUrl: result.fileUrl,
        filename: result.filename,
        label: `PPT: ${result.filename}`,
        explanation: (result.explanation || "Successfully generated PowerPoint presentation.") + metricsSummary,
        confidence: 0.95,
      };
    } catch (err: any) {
      console.error(`[exportPptNode] Error:`, err.message);
      
      // Fallback Logic
      return {
        value: null,
        fileUrl: null,
        label: "PPT Generation Failed",
        explanation: `Failed to generate PPT: ${err.message}. Please ensure the PPT worker is running.`,
        confidence: 0.1,
        error: err.message
      };
    }
  },
};
