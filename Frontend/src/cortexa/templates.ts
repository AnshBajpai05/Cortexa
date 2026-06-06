import { Node, Edge } from "reactflow";
import { CortexaNodeData } from "./types";

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  nodes: Node<CortexaNodeData>[];
  edges: Edge[];
}

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: "grounded-analyst",
    name: "Grounded Analyst",
    description: "Searches the live web, then writes a cited analysis grounded ONLY in those results. Kills hallucination — the analyst can't invent facts.",
    nodes: [
      {
        id: "node-search",
        type: "cortexaNode",
        position: { x: 100, y: 150 },
        data: {
          kind: "tool.web-search",
          label: "Web Search",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            provider: "auto",
            maxResults: 5,
            prompt: "latest NVIDIA NIM available models 2026"
          }
        }
      },
      {
        id: "node-analyst",
        type: "cortexaNode",
        position: { x: 460, y: 150 },
        data: {
          kind: "text.run-any-llm",
          label: "Grounded Analyst",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            role: "Research Analyst",
            goal: "Write a concise, cited analysis using ONLY the provided web context. Cite sources as [n].",
            requireContext: "hard",
            prompt: "Summarize the key findings and cite each claim."
          }
        }
      }
    ],
    edges: [
      { id: "e1", source: "node-search", target: "node-analyst", type: "smoothstep" }
    ]
  },
  {
    id: "instagram-ad-engine",
    name: "Instagram Ad Engine",
    description: "End-to-end multimodal pipeline: Writes ad copy, crafts an image prompt, generates the creative, and QAs the text.",
    nodes: [
      {
        id: "node-text-copy",
        type: "cortexaNode",
        position: { x: 100, y: 150 },
        data: {
          kind: "text",
          label: "Copywriter",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            role: "Direct Response Marketer",
            goal: "Write a high-converting Instagram ad caption for a new premium coffee blend.",
            model: "llama3-8b-8192",
            maxTokens: 500,
            temperature: 0.7,
            prompt: "Write a catchy Instagram caption. Must include a hook, benefits, and a CTA."
          }
        }
      },
      {
        id: "node-text-prompt",
        type: "cortexaNode",
        position: { x: 400, y: 50 },
        data: {
          kind: "text",
          label: "Prompt Enhancer",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            role: "Midjourney Prompt Engineer",
            goal: "Take an ad concept and write a highly detailed visual prompt for an image generator.",
            model: "llama3-8b-8192",
            maxTokens: 200,
            temperature: 0.3,
            prompt: "Based on the ad copy, write a prompt to generate a photorealistic product image."
          }
        }
      },
      {
        id: "node-image-gen",
        type: "cortexaNode",
        position: { x: 700, y: 50 },
        data: {
          kind: "image",
          label: "Image Generator",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            model: "stabilityai/stable-diffusion-xl-base-1.0",
            width: 1024,
            height: 1024,
            numInferenceSteps: 30
          }
        }
      },
      {
        id: "node-qa",
        type: "cortexaNode",
        position: { x: 400, y: 250 },
        data: {
          kind: "logic",
          label: "QA Evaluator",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            model: "llama3-8b-8192",
            rubric: "Caption MUST contain exactly 3 emojis, a clear call to action, and sound premium. Fail if it sounds cheap or uses too many emojis.",
            threshold: 8
          }
        }
      }
    ],
    edges: [
      { id: "e1", source: "node-text-copy", target: "node-text-prompt", type: "smoothstep" },
      { id: "e2", source: "node-text-prompt", target: "node-image-gen", type: "smoothstep" },
      { id: "e3", source: "node-text-copy", target: "node-qa", type: "smoothstep" }
    ]
  },
  {
    id: "slide-deck-planner",
    name: "Slide Deck Planner",
    description: "Generates structured JSON presentation data ready for PPT export.",
    nodes: [
      {
        id: "node-outline",
        type: "cortexaNode",
        position: { x: 100, y: 150 },
        data: {
          kind: "text",
          label: "Outline Generator",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            role: "Strategy Consultant",
            goal: "Outline a 5-slide presentation.",
            model: "llama3-8b-8192",
            prompt: "Create an outline for a pitch deck about 'AI in Marketing'."
          }
        }
      },
      {
        id: "node-content",
        type: "cortexaNode",
        position: { x: 400, y: 150 },
        data: {
          kind: "text",
          label: "Slide Content Gen",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            role: "Presentation Writer",
            goal: "Turn an outline into slide JSON.",
            model: "llama3-8b-8192",
            prompt: "Take the outline and format it EXACTLY as a JSON object with 'title' and 'slides' array. Each slide needs a 'title' and 'bullets' string array. NO MARKDOWN."
          }
        }
      },
      {
        id: "node-export",
        type: "cortexaNode",
        position: { x: 700, y: 150 },
        data: {
          kind: "output",
          label: "Export (PPT Data)",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            format: "presentation_data",
            filename: "marketing-pitch"
          }
        }
      }
    ],
    edges: [
      { id: "e1", source: "node-outline", target: "node-content", type: "smoothstep" },
      { id: "e2", source: "node-content", target: "node-export", type: "smoothstep" }
    ]
  },
  {
    id: "blog-engine",
    name: "Blog Engine",
    description: "Long-form content generator with built-in QA and Markdown export.",
    nodes: [
      {
        id: "node-outline",
        type: "cortexaNode",
        position: { x: 100, y: 150 },
        data: {
          kind: "text",
          label: "SEO Planner",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            role: "SEO Strategist",
            prompt: "Outline a blog post about 'The Future of Agentic AI'. Include H2s and target keywords."
          }
        }
      },
      {
        id: "node-writer",
        type: "cortexaNode",
        position: { x: 400, y: 150 },
        data: {
          kind: "text",
          label: "Content Writer",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            role: "Technical Writer",
            prompt: "Write the full blog post based on the outline. Use markdown formatting."
          }
        }
      },
      {
        id: "node-qa",
        type: "cortexaNode",
        position: { x: 700, y: 150 },
        data: {
          kind: "logic",
          label: "Editorial Review",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            rubric: "The blog must be engaging, use proper Markdown headers, and be free of fluff.",
            threshold: 8
          }
        }
      },
      {
        id: "node-export",
        type: "cortexaNode",
        position: { x: 1000, y: 150 },
        data: {
          kind: "output",
          label: "Export (Markdown)",
          status: "queued",
          currentAttempt: 1,
          attempts: [{ attempt: 1, status: "queued" }],
          config: {
            format: "markdown",
            filename: "agentic-ai-blog"
          }
        }
      }
    ],
    edges: [
      { id: "e1", source: "node-outline", target: "node-writer", type: "smoothstep" },
      { id: "e2", source: "node-writer", target: "node-qa", type: "smoothstep" },
      { id: "e3", source: "node-qa", target: "node-export", type: "smoothstep" } // Note: technically QA doesn't return the content itself in the current backend design, but in standard DAGs the export could just pull from the writer if we resolve inputs properly.
    ]
  }
];
