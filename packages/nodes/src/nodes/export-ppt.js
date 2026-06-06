"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportPptNode = void 0;
const zod_1 = require("zod");
const flowExtractor_1 = require("../utils/flowExtractor");
const diagramBuilder_1 = require("../utils/diagramBuilder");
const ExportPptConfig = zod_1.z.object({
    filename: zod_1.z.string().optional(),
    templatePath: zod_1.z.string().optional(),
});
exports.exportPptNode = {
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
    run: async (ctx, rawConfig) => {
        const config = ExportPptConfig.parse(rawConfig);
        const presentationData = ctx.inputs["presentation_json"];
        if (!presentationData) {
            throw new Error(`[exportPptNode] Missing required input: presentation_json`);
        }
        const slides = presentationData.slides || [];
        const textContext = slides.map((s) => s.title + " " + (s.bullets || []).join(" ")).join("\n");
        const componentCount = slides.filter((s) => s.semantic_role === "component" || s.title.toLowerCase().includes("layer")).length;
        const flowVerbs = ["process", "route", "normalize", "classify", "detect", "store", "extract", "validate"];
        const hasFlowVerbs = flowVerbs.some((v) => textContext.toLowerCase().includes(v));
        const hasExplicitDiagram = textContext.toLowerCase().includes("architecture diagram");
        const hasSequentialComponents = textContext.toLowerCase().includes("pipeline") || textContext.toLowerCase().includes("flow");
        const isArchitecture = hasExplicitDiagram || hasSequentialComponents || (componentCount > 4 && hasFlowVerbs);
        if (isArchitecture) {
            console.log(`[exportPptNode] Auto-detected architecture diagram intent. Extracting flow...`);
            const graph = await (0, flowExtractor_1.extractFlow)(textContext, ctx);
            if (graph && graph.mermaid_code) {
                const spec = (0, diagramBuilder_1.buildDiagramSpec)(graph);
                let insertIndex = 2;
                for (let i = 0; i < slides.length; i++) {
                    const t = slides[i].title?.toLowerCase() || "";
                    if (t.includes("system overview") || t.includes("architecture") || t.includes("approach") || t.includes("design")) {
                        insertIndex = i + 1;
                        break;
                    }
                }
                const diagramSlide = {
                    type: "diagram",
                    title: "System Architecture & Processing Flow",
                    semantic_role: "architecture",
                    diagram: {
                        source: "auto",
                        render_mode: "mermaid",
                        spec: spec
                    }
                };
                slides.splice(insertIndex, 0, diagramSlide);
                console.log(`[exportPptNode] Injected diagram slide at index ${insertIndex}.`);
            }
        }
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
                    title: presentationData.title || "Cortexa Presentation",
                    slides: presentationData.slides || [],
                    template_path: templatePath,
                    output_filename: config.filename,
                    nvidia_key: ctx.env.NVIDIA_LLM_KEY,
                }),
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`PPT Worker failed: ${JSON.stringify(errorData)}`);
            }
            const result = (await response.json());
            return {
                value: result.fileUrl,
                fileUrl: result.fileUrl,
                filename: result.filename,
                label: `PPT: ${result.filename}`,
                explanation: result.explanation || "Successfully generated PowerPoint presentation.",
                confidence: 0.95,
            };
        }
        catch (err) {
            console.error(`[exportPptNode] Error:`, err.message);
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
//# sourceMappingURL=export-ppt.js.map