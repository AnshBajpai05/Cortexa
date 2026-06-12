import 'dotenv/config';
import { Worker, Job } from 'bullmq';
import { nodeRegistry, RunContext, auditModelConfig } from '@cortexa/nodes';

const REDIS_HOST = process.env.REDIS_HOST ?? 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT ?? 6379);
const API_URL = process.env.API_URL ?? 'http://localhost:3001/api';
const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET ?? '';

// T1-6: fail-closed — a worker without the shared secret can only produce
// rejected callbacks, which strands every run. Refuse to boot instead.
if (!WEBHOOK_SECRET.trim()) {
  console.error('FATAL: INTERNAL_WEBHOOK_SECRET is not set. Refusing to start (fail-closed).');
  process.exit(1);
}

console.log(`🤖 Cortexa Worker starting [PID: ${process.pid}]... Connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);
console.log(`📜 Registered nodes: ${Array.from(nodeRegistry.keys()).join(', ')}`);

// Print the resolved model map + warn loudly if any key is missing (MOCK mode),
// so empty-key runs are never mistaken for real inference.
auditModelConfig(process.env);

async function pushLog(runId: string, nodeId: string, status: string, details: any = {}) {
  try {
    await fetch(`${API_URL}/internal/runs/${runId}/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({ nodeId, status, ...details }),
    });
  } catch (err) {
    console.error(`Failed to push log for run ${runId}`, err);
  }
}

async function pushMetric(data: {
  runId: string;
  nodeId: string;
  model?: string;
  latencyMs: number;
  tokenCount?: number;
  costEstimate?: number;
  attempt?: number;
  success?: boolean;
}) {
  try {
    await fetch(`${API_URL}/metrics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch (err) {
    console.error(`Failed to push metric for run ${data.runId}`, err);
  }
}

const worker = new Worker(
  'runs',
  async (job: Job) => {
    const { runId, workflowId, nodeId } = job.data;
    
    console.log(`\n▶️ [JOB START] Run: ${runId} | Node: ${nodeId}`);
    await pushLog(runId, nodeId, 'started', { inputJson: job.data });

    try {
      // 1. Fetch the resolved inputs for this run from the API
      // This merges the node's config with the outputs of all parent nodes
      
      const runRes = await fetch(`${API_URL}/runs/${runId}/resolved-inputs`);
      if (!runRes.ok) throw new Error(`Failed to fetch resolved inputs for run ${runId}`);
      const inputs = await runRes.json() as any;

      // 2. Find the Node Manifest in the registry
      // We use nodeType (kind) passed from the API
      const typeId = job.data.nodeType || nodeId; 
      const manifest = nodeRegistry.get(typeId);
      if (!manifest) {
        throw new Error(`Node type '${typeId}' not found in registry`);
      }

      // 3. Build the context
      const ctx: RunContext = {
        runId,
        workflowId,
        nodeId,
        attempt: 1,
        inputs,
        env: {
          // ── Legacy (kept for backward compat) ──────────────────────────────
          GROQ_API_KEY: process.env.GROQ_API_KEY || '',
          HUGGINGFACE_API_KEY: process.env.HUGGINGFACE_API_KEY || '',
          // ── LocalStack S3 ─────────────────────────────────────────────────
          S3_ENDPOINT: process.env.S3_ENDPOINT || '',
          S3_BUCKET: process.env.S3_BUCKET || '',
          // ── NVIDIA NIM — per-model keys ───────────────────────────────────
          NVIDIA_LLM_KEY:      process.env.NVIDIA_LLM_KEY      || '',
          NVIDIA_GLM_KEY:      process.env.NVIDIA_GLM_KEY      || '',
          NVIDIA_VISION_KEY:   process.env.NVIDIA_VISION_KEY   || '',
          NVIDIA_EMBED_KEY:    process.env.NVIDIA_EMBED_KEY    || '',
          NVIDIA_BGE_KEY:      process.env.NVIDIA_BGE_KEY      || '',
          NVIDIA_RERANK_KEY:   process.env.NVIDIA_RERANK_KEY   || '',
          NVIDIA_PALIGEMMA_KEY:process.env.NVIDIA_PALIGEMMA_KEY|| '',
          NVIDIA_OCR_KEY:      process.env.NVIDIA_OCR_KEY      || '',
          NVIDIA_SAFETY_KEY:   process.env.NVIDIA_SAFETY_KEY   || '',
          NVIDIA_IMAGE_KEY:    process.env.NVIDIA_IMAGE_KEY    || '',
          // ── Web Search ─────────────────────────────────────────────────────
          TAVILY_API_KEY:      process.env.TAVILY_API_KEY      || '',
          // ── Redis ──────────────────────────────────────────────────────────
          REDIS_HOST:          process.env.REDIS_HOST          || 'localhost',
          REDIS_PORT:          Number(process.env.REDIS_PORT   || 6379),
          API_URL:             API_URL,
        },
      };

      // 4. Execute the node with Engine-level Retry & Fallback (Phase 2)
      console.log(`   Executing agent: ${manifest.name}`);
      
      let output: any;
      let attempts = 0;
      const MAX_RETRIES = 2;
      const executionStart = Date.now();
      
      while (attempts <= MAX_RETRIES) {
        try {
          ctx.attempt = attempts + 1;
          output = await manifest.run(ctx, inputs);
          break; // success
        } catch (err: any) {
          attempts++;
          
          let errorObj;
          try { errorObj = JSON.parse(err.message); } catch (e) { errorObj = { message: err.message }; }
          
          if (attempts <= MAX_RETRIES) {
            console.warn(`   [RETRY] Node ${nodeId} failed. Retrying (${attempts}/${MAX_RETRIES})...`);
            await pushLog(runId, nodeId, 'retry', { attempt: attempts, error: errorObj });
            await new Promise(res => setTimeout(res, 2000 * attempts));
          } else {
             console.warn(`   [FALLBACK] Node ${nodeId} exhausted retries.`);
             await pushLog(runId, nodeId, 'fallback', { error: errorObj });
             throw err;
          }
        }
      }

      const latencyMs = Date.now() - executionStart;
      
      console.log(`✅ [JOB SUCCESS] Run: ${runId} (${latencyMs}ms)`);
      await pushLog(runId, nodeId, 'success', { outputJson: output });

      // 5. Emit metrics
      await pushMetric({
        runId,
        nodeId,
        model: (inputs as any)?.model ?? output?.model ?? undefined,
        latencyMs,
        tokenCount: output?.usage?.total_tokens ?? undefined,
        attempt: attempts + 1,
        success: true,
      });

      // 6. Callback to API
      await fetch(`${API_URL}/internal/runs/${runId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          status: 'completed',
          outputsJson: output,
        }),
      });

      return { success: true, output, latencyMs };

    } catch (error: any) {
      console.error(`❌ [JOB FAILED] Run: ${runId} | Error:`, error.message);
      if (error.stack) console.error(error.stack);
      
      // Emit failure metric
      await pushMetric({
        runId,
        nodeId,
        latencyMs: 0,
        success: false,
      });

      let parsedError = null;
      try { parsedError = JSON.parse(error.message); } catch (e) {}

      await pushLog(runId, nodeId, 'failed', { errorJson: parsedError || { message: error.message, stack: error.stack } });

      // T1-1 ORDERING FIX: report 'failed' FIRST so the API's propagateFailure
      // marks old queued descendants as skipped BEFORE retry-backward creates
      // fresh queued replacement runs. (Previous order let propagation kill the
      // very runs the self-correction loop had just re-queued.)
      await fetch(`${API_URL}/internal/runs/${runId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': WEBHOOK_SECRET,
        },
        body: JSON.stringify({
          status: 'failed',
          errorJson: { message: error.message, stack: error.stack },
        }),
      });

      // Self-Correction Loop Phase 3: trigger backward retry if QA, Safety, or Grounding failed
      if (parsedError && (parsedError.type === "QA_FAILED" || parsedError.type === "SAFETY_BLOCKED" || parsedError.type === "UNGROUNDED_EXECUTION")) {
        const loopType = parsedError.type;
        console.log(`   [${loopType}] Initiating guided self-correction loop for Run: ${runId}`);

        // Build actionable, guided feedback instead of a dumb "retry"
        let guidedFeedback: string[];
        if (parsedError.type === "UNGROUNDED_EXECUTION") {
          guidedFeedback = [
            `Execution Blocked: ${parsedError.message}`,
            `To fix this, you must connect a data source (context) to this node or enable grounding memory.`,
            `The node is configured with 'hard' grounding enforcement to prevent hallucination.`
          ];
        } else if (parsedError.type === "SAFETY_BLOCKED") {
          guidedFeedback = [
            `Your previous output was blocked by the Llama Guard safety classifier. Violation category: "${parsedError.category ?? 'unknown'}".`,
            `Rewrite your response to avoid the following policy violation: ${parsedError.category ?? 'unsafe content'}.`,
            `Do NOT include any content that falls under this category. Produce a safe, policy-compliant alternative that still achieves the original goal.`,
          ];
        } else {
          // QA_FAILED — use the specific rubric issues from the evaluator
          const issues: string[] = parsedError.feedback ?? ["Output did not meet quality threshold."];
          guidedFeedback = [
            `Your previous output failed QA evaluation with score ${parsedError.score ?? 'N/A'}.`,
            ...issues.map((issue: string) => `Issue to fix: ${issue}`),
            `Rewrite your response specifically addressing ALL of the issues listed above.`,
          ];
        }

        await fetch(`${API_URL}/runs/${runId}/retry-backward`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedback: guidedFeedback }),
        });
      }

      throw error;
    }
  },
  {
    connection: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    // T1-3: parallel branches actually run in parallel (was default 1 = serial DAG)
    concurrency: Number(process.env.WORKER_CONCURRENCY || 4),
    lockDuration: 600000, // 10 minutes for heavy 70B reasoning tasks
  }
);

worker.on('error', err => {
  console.error('Worker error:', err);
});
