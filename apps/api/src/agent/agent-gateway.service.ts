import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { RunsService } from '../runs/runs.service';
import { nodeRegistry, validateGraph, MODELS } from '@cortexa/nodes';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntentPlan {
  intent: string;
  steps: string[];
  requires_visual: boolean;
  complexity: "low" | "medium" | "high";
  output_type: "text" | "image" | "ppt" | "json";
}

interface PipelineNode {
  id: string;
  data: { kind: string; label: string; config: Record<string, any> };
}

interface PipelineEdge {
  source: string;
  target: string;
  targetInput?: string;
  sourceHandle?: string;
}

// ── Final Output Contract ─────────────────────────────────────────────────────
// Every pipeline — regardless of type — returns this shape.

export interface AgentOutput {
  workflowId: string;
  output_type: 'text' | 'image' | 'ppt' | 'json' | 'fallback';
  pipeline: {
    nodes: string[];
    edges: number;
    plan: IntentPlan | null;
    usedFallback: boolean;
  };
  execution: {
    message: string;
    runIds: string[];
    entryRunIds: string[];
  };
}

// ─── Agent Gateway Service ────────────────────────────────────────────────────

import { PptOrchestrator, SemanticChunk, PPT_CATEGORIES } from './ppt-orchestrator';

@Injectable()
export class AgentGatewayService {
  private readonly logger = new Logger(AgentGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
    private readonly runsService: RunsService,
  ) {}

  // ── Main Entry Point ──────────────────────────────────────────────────────
  async run(prompt: string): Promise<AgentOutput> {
    this.logger.log(`[AgentGateway] Received prompt: "${prompt.slice(0, 80)}..."`);

    // Step 1: Classify Intent
    let plan: IntentPlan;
    try {
      plan = await this.classifyIntent(prompt);
      this.logger.log(`[AgentGateway] Plan: ${JSON.stringify(plan)}`);
    } catch (e: any) {
      this.logger.warn(`[AgentGateway] Intent classification failed: ${e.message}. Using fallback.`);
      const fallback = this.buildFallbackPipeline(prompt);
      return this.executeGraph(fallback, prompt, null, true);
    }

    // Step 1.5: Meaning-First Pre-processing for PPT
    let augmentedPrompt = prompt;
    if (plan.intent === 'PRESENTATION') {
      try {
        augmentedPrompt = await this.orchestratePptContent(prompt);
      } catch (e: any) {
        this.logger.error(`[AgentGateway] PPT Orchestration failed: ${e.message}`);
      }
    }

    // Step 2: Map Plan → Pipeline (deterministic)
    const graph = this.mapPlanToPipeline(plan, augmentedPrompt);

    // Step 3: Validate Graph (pre-save)
    const validation = validateGraph(graph, nodeRegistry);
    if (!validation.valid) {
      this.logger.warn(`[AgentGateway] Generated graph failed validation: ${JSON.stringify(validation.errors)}. Using fallback.`);
      const fallback = this.buildFallbackPipeline(prompt);
      return this.executeGraph(fallback, prompt, plan, true);
    }

    // Step 4: Execute
    return this.executeGraph(graph, prompt, plan, false);
  }

  /**
   * Implements "Extract → Classify → Normalize → Assemble"
   */
  private async orchestratePptContent(sourceText: string): Promise<string> {
    this.logger.log('[AgentGateway] Starting Semantic PPT Orchestration...');
    
    // 1. Extract (Chunking)
    const chunks = PptOrchestrator.chunkReadme(sourceText);
    this.logger.log(`[AgentGateway] Extracted ${chunks.length} chunks from README.`);

    // 2. Batch Classify (One call for all chunks to avoid hangs)
    const titles = chunks.map((c, i) => `${i}: ${c.title}`).join('\n');
    const categories = await this.batchClassifyChunks(titles);
    
    const classifiedChunks = chunks.map((chunk, i) => ({
      ...chunk,
      category: categories[i] || 'misc'
    }));

    // 3. Assemble
    const grouped = PptOrchestrator.assemble(classifiedChunks);
    const narrative = PptOrchestrator.getReassembledPrompt(grouped);
    
    this.logger.log('[AgentGateway] Semantic reassembly complete.');
    return narrative;
  }

  private async batchClassifyChunks(titles: string): Promise<string[]> {
    const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
    const apiKey = process.env.NVIDIA_LLM_KEY || '';

    try {
      const response = await fetch(`${NVIDIA_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODELS.fast,
          messages: [
            { 
              role: 'system', 
              content: `You are a classifier. Classify each numbered title into one of: [${PPT_CATEGORIES.join(', ')}]. 
              Return a simple JSON array of strings corresponding to the titles in order.` 
            },
            { role: 'user', content: titles }
          ],
          temperature: 0.0,
        }),
      });

      const data = await response.json();
      const content = data.choices[0].message.content;
      
      // Hyper-robust extraction for the batch categories
      let cleaned = content.trim().replace(/^```json\n?/, "").replace(/\n?```$/, "");
      const startIdx = cleaned.indexOf("[");
      const endIdx = cleaned.lastIndexOf("]");
      if (startIdx !== -1 && endIdx !== -1) cleaned = cleaned.substring(startIdx, endIdx + 1);
      
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed : (parsed.categories || Object.values(parsed));
    } catch (e) {
      this.logger.error('Batch classification failed', e);
      return [];
    }
  }

  // ── Intent Classifier (Llama — fast/cheap) ────────────────────────────────
  async classifyIntent(prompt: string): Promise<IntentPlan> {
    const NVIDIA_BASE = "https://integrate.api.nvidia.com/v1";
    const apiKey = process.env.NVIDIA_LLM_KEY || '';

    const systemPrompt = `You are an intent classifier for an AI pipeline system.
Given a user prompt, classify it and return ONLY valid JSON.

Rules:
- intent: one of MARKETING_AD, PRESENTATION, ANALYSIS, CREATIVE_WRITING, GENERAL
- steps: array of high-level operations needed (analyze, write, validate, generate image, create presentation, critique)
- requires_visual: true if the task needs image generation
- complexity: low (simple question), medium (needs reasoning), high (needs deep logic + multi-path validation)
- output_type: one of text, image, ppt, json (the primary deliverable format)

Output ONLY raw JSON. No markdown fences. No explanation.

Example:
{"intent":"MARKETING_AD","steps":["analyze","write","generate image"],"requires_visual":true,"complexity":"medium","output_type":"image"}`;

    // HEURISTIC OVERRIDES (Fast Path)
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('create me a instagram add') || lowerPrompt.includes('marketing ad')) {
      return { intent: 'MARKETING_AD', steps: ['analyze', 'write', 'generate image'], requires_visual: true, complexity: 'medium', output_type: 'image' };
    }
    if (lowerPrompt.includes('ppt') || lowerPrompt.includes('presentation')) {
      return { intent: 'PRESENTATION', steps: ['analyze', 'write', 'create presentation'], requires_visual: false, complexity: 'medium', output_type: 'ppt' };
    }

    const classificationSnippet = prompt.length > 1000 ? prompt.slice(0, 500) + "..." + prompt.slice(-500) : prompt;
    this.logger.debug(`[AgentGateway] Classifying snippet: ${classificationSnippet.slice(0, 100)}...`);

    const res = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODELS.fast,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: classificationSnippet },
        ],
        max_tokens: 300,
        temperature: 0.0,
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`NVIDIA API returned ${res.status}`);
    }

    const data = await res.json() as any;
    const rawText = data.choices?.[0]?.message?.content ?? '';

    // Extract JSON from response
    const startIdx = rawText.indexOf('{');
    const endIdx = rawText.lastIndexOf('}');
    if (startIdx === -1 || endIdx === -1) throw new Error('No JSON in response');

    const parsed = JSON.parse(rawText.substring(startIdx, endIdx + 1));

    return {
      intent: parsed.intent || 'GENERAL',
      steps: Array.isArray(parsed.steps) ? parsed.steps : ['analyze'],
      requires_visual: !!parsed.requires_visual,
      complexity: parsed.complexity || 'medium',
      output_type: parsed.output_type || 'text',
    };
  }

  // ── Pipeline Mapper (Deterministic — NO LLM) ─────────────────────────────
  mapPlanToPipeline(plan: IntentPlan, prompt: string): { nodes: PipelineNode[]; edges: PipelineEdge[] } {
    const nodes: PipelineNode[] = [];
    const edges: PipelineEdge[] = [];

    const steps = plan.steps.map(s => s.toLowerCase().trim());

    // Helper: dedup node insertion
    const addNode = (node: PipelineNode) => {
      if (!nodes.find(n => n.id === node.id)) {
        nodes.push(node);
      }
    };

    // Model selection is centralised in @cortexa/nodes models.config (env-overridable).
    // analyst  → deep strategic reports (replaces the deprecated llama-3.1-405b)
    // reasoning → balanced speed/intelligence (replaces the deprecated llama-3.1-70b)
    const analystModel = MODELS.analyst;
    const reasoningModel = MODELS.reasoningMid;

    // Always start with an analyst
    addNode({
      id: 'analyst',
      data: {
        kind: 'text.run-any-llm',
        label: 'Market Analyst',
        config: { 
          model: analystModel,
          role: 'Strategic Analyst',
          goal: 'Research and analyze the market opportunity based on the prompt.',
          prompt: prompt, // INJECT THE ACTUAL PROMPT
          temperature: 0, // Deterministic analysis
          systemPrompt: analystModel.includes('kimi') 
            ? 'You are a high-density strategic analyst. Provide a deep but CONCISE report. No fluff. Use structured bullet points.' 
            : 'You are a strategic analyst. Provide a clear report on the market opportunity.'
        },
      },
    });

    // Adversary (if high complexity or requested)
    const needsAdversary = plan.complexity === 'high' || steps.some(s => s.includes('adversary') || s.includes('critique') || s.includes('challenge'));
    if (needsAdversary) {
      addNode({
        id: 'adversary',
        data: {
          kind: 'logic.adversary',
          label: 'Devil\'s Advocate',
          config: { model: MODELS.fast },
        },
      });
      edges.push({ source: 'analyst', sourceHandle: 'text', target: 'adversary', targetInput: 'context' });
    }

    // Safety/Validator (if requested)
    if (steps.some(s => s.includes('validate') || s.includes('check safety') || s.includes('verify'))) {
      addNode({
        id: 'safety-validator',
        data: {
          kind: 'logic.validator',
          label: 'Logic Validator',
          config: { model: MODELS.fast },
        },
      });
      edges.push({ source: 'analyst', sourceHandle: 'text', target: 'safety-validator', targetInput: 'input_text' });
    }

    // Logic Layer: Resolver + Formatter (for non-low complexity)
    const skipIntermediate = plan.intent === 'PRESENTATION';
    if (!skipIntermediate && (plan.complexity !== 'low' || steps.some(s => s.includes('decide') || s.includes('resolve') || s.includes('analyze')))) {
      addNode({
        id: 'resolver',
        data: {
          kind: 'logic.resolver',
          label: 'Decision Resolver',
          config: { model: reasoningModel },
        },
      });
      edges.push({ source: 'analyst', sourceHandle: 'text', target: 'resolver', targetInput: 'analyst_output' });

      if (nodes.find(n => n.id === 'adversary')) {
        edges.push({ source: 'adversary', sourceHandle: 'attack_report', target: 'resolver', targetInput: 'adversary_report' });
      }

      addNode({
        id: 'formatter',
        data: {
          kind: 'logic.formatter',
          label: 'Response Formatter',
          config: { model: MODELS.fast },
        },
      });
      edges.push({ source: 'resolver', target: 'formatter', targetInput: 'resolver_output' });
    }

    // Copywriter (if text generation needed)
    if (!skipIntermediate && steps.some(s => s.includes('write') || s.includes('generate copy') || s.includes('copy'))) {
      const isMarketing = plan.intent === 'MARKETING_AD';
      addNode({
        id: 'copywriter',
        data: {
          kind: 'text.run-any-llm',
          label: 'Copywriter',
          config: {
            model: reasoningModel,
            role: 'Master Copywriter',
            goal: 'Generate compelling marketing copy based on the strategic context.',
            prompt: prompt,
            ...(isMarketing && {
              jsonSchema: JSON.stringify({
                type: "object",
                properties: {
                  headline: { type: "string" },
                  tagline: { type: "string" },
                  call_to_action: { type: "string" },
                  body_text: { type: "string" }
                }
              })
            })
          },
        },
      });
      const contextSource = nodes.find(n => n.id === 'formatter') ? 'formatter' : 'analyst';
      edges.push({
        source: contextSource,
        target: 'copywriter',
        targetInput: 'prompt',
        sourceHandle: contextSource === 'formatter' ? 'historical_context' : 'text',
      });
    }

    // Visual pipeline (if images needed)
    if (plan.requires_visual) {
      addNode({
        id: 'visual-prompter',
        data: {
          kind: 'text.run-any-llm',
          label: 'Visual Concept Artist',
          config: {
            model: MODELS.fast,
            role: 'Concept Artist',
            goal: 'Create a concise visual prompt for image generation.',
            prompt: `You are a Master Concept Artist. Translate marketing copy into a cinematic visual prompt.
            
            RULES:
            1. RAW TEXT ONLY: Output ONLY the descriptive prompt. No headers, no "Scene:", no "Visual Prompt:", no conversation.
            2. NO RANDOM TEXT: Describe a scene with zero background gibberish. Only the main subject.
            3. PRODUCT IDENTITY: Include a realistic product container (e.g., jar, bottle) with sleek branding.
            4. TIGHT COUPLING: The visual MUST reflect the provided headline and tone.
            5. CINEMATIC: Use '8k photorealistic', 'volumetric lighting'.`,
          },
        },
      });
      addNode({
        id: 'image-gen',
        data: {
          kind: 'image.compositor',
          label: 'Image Generator',
          config: {
            model: 'black-forest-labs/flux1-dev',
            width: 1024,
            height: 1024,
          },
        },
      });

      const contextSource = nodes.find(n => n.id === 'formatter') ? 'formatter' : 'analyst';
      const sourceHandle = contextSource === 'formatter' ? 'context' : 'text';
      edges.push({
        source: contextSource,
        target: 'visual-prompter',
        targetInput: 'strategy', // renamed for clarity
        sourceHandle,
      });

      // NEW: Tight Coupling - feed copywriter output into visual prompter
      if (nodes.find(n => n.id === 'copywriter')) {
        edges.push({ 
          source: 'copywriter', 
          sourceHandle: 'text', 
          target: 'visual-prompter', 
          targetInput: 'context' 
        });
      }

      edges.push({ source: 'visual-prompter', sourceHandle: 'value', target: 'image-gen', targetInput: 'prompt' });

      // Wire copywriter outputs to image if both exist
      if (nodes.find(n => n.id === 'copywriter')) {
        edges.push({ source: 'copywriter', sourceHandle: 'headline', target: 'image-gen', targetInput: 'headline' });
        edges.push({ source: 'copywriter', sourceHandle: 'tagline', target: 'image-gen', targetInput: 'tagline' });
        edges.push({ source: 'copywriter', sourceHandle: 'call_to_action', target: 'image-gen', targetInput: 'cta' });
      }
    }

    // PPT Export (if output_type is ppt)
    if (plan.output_type === 'ppt' || steps.includes('create presentation')) {
      addNode({
        id: 'ppt-exporter',
        data: {
          kind: 'output.ppt',
          label: 'PPT Generator',
          config: { theme: 'corporate' },
        },
      });
      
      // We need a structured slide generator before the exporter
      addNode({
        id: 'slide-generator',
        data: {
          kind: 'text.run-any-llm',
          label: 'Slide Architect',
          config: {
            model: MODELS.reasoningMid, // mid reasoning tier for fast formatting (Smart Split)
            maxTokens: 8192,
            goal: 'Transform analysis into a balanced, multi-slide technical deck (7-10 slides).',
            prompt: `${prompt}

Write a slide deck based on the analysis above. 
For each slide, provide a Title, a Semantic Role (problem, vision, architecture, or impact), and 4-5 detailed bullets.

You MUST generate at least 7 slides.`,
            temperature: 0, // Deterministic slide structure
            jsonSchema: JSON.stringify({
              type: "object",
              properties: {
                slides: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      semantic_role: { type: "string" },
                      bullets: { type: "array", items: { type: "string" } }
                    }
                  }
                }
              }
            })
          },
        },
      });

      const contextSource = nodes.find(n => n.id === 'formatter') ? 'formatter' : 'analyst';
      edges.push({ source: contextSource, target: 'slide-generator', targetInput: 'context' });
      edges.push({ source: 'slide-generator', sourceHandle: 'structuredData', target: 'ppt-exporter', targetInput: 'presentation_json' });
    }

    // Edge safety: filter out edges referencing non-existent nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    const safeEdges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

    return { nodes, edges: safeEdges };
  }

  // ── Fallback Pipeline (never fails) ───────────────────────────────────────
  buildFallbackPipeline(prompt: string): { nodes: PipelineNode[]; edges: PipelineEdge[] } {
    return {
      nodes: [{
        id: 'default',
        data: {
          kind: 'text.run-any-llm',
          label: 'AI Assistant',
          config: {
            model: MODELS.fast,
            prompt,
            role: 'Helpful AI Assistant',
            goal: 'Answer the user\'s request directly.',
          },
        },
      }],
      edges: [],
    };
  }

  // ── Execute: Save workflow → trigger → return AgentOutput ──────────────────
  private async executeGraph(
    graph: { nodes: PipelineNode[]; edges: PipelineEdge[] },
    prompt: string,
    plan: IntentPlan | null,
    usedFallback: boolean,
  ): Promise<AgentOutput> {
    // Save as workflow
    const workflow = await this.workflowsService.create({
      name: `Agent: ${prompt.slice(0, 50)}...`,
      workspaceId: 'default-workspace',
      jsonGraph: graph,
    });

    // Trigger execution
    const triggerResult = await this.runsService.trigger(workflow.id);

    // Determine output type
    const outputType: AgentOutput['output_type'] = usedFallback
      ? 'fallback'
      : (plan?.output_type || 'text');

    const result: AgentOutput = {
      workflowId: workflow.id,
      output_type: outputType,
      pipeline: {
        nodes: graph.nodes.map(n => n.id),
        edges: graph.edges.length,
        plan,
        usedFallback,
      },
      execution: {
        message: triggerResult.message,
        runIds: triggerResult.runIds,
        entryRunIds: triggerResult.entryRunIds,
      },
    };

    this.logger.log(`[AgentGateway] Pipeline dispatched: ${result.pipeline.nodes.join(' → ')} | type=${outputType} | fallback=${usedFallback}`);

    return result;
  }
}
