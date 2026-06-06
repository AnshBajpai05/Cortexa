import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';

// ─── Topological Sort ─────────────────────────────────────────────────────────
// Given a DAG definition (nodes + edges), returns nodeIds in execution order
function topologicalSort(graph: {
  nodes: { id: string; [key: string]: any }[];
  edges: { source: string; target: string; [key: string]: any }[];
}): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  for (const node of graph.nodes) {
    inDegree.set(node.id, 0);
    adjList.set(node.id, []);
  }

  for (const edge of graph.edges) {
    adjList.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length) {
    const curr = queue.shift()!;
    sorted.push(curr);
    for (const neighbor of adjList.get(curr) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return sorted;
}

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
    @InjectQueue('runs') private readonly runsQueue: Queue,
  ) {}

  // ── Trigger a full workflow run ──────────────────────────────────────────────
  async trigger(workflowId: string) {
    const workflow = await this.workflowsService.findOne(workflowId);

    const graph = workflow.jsonGraph as {
      nodes: { id: string; data: { nodeType: string; config: unknown } }[];
      edges: { source: string; target: string }[];
    };

    if (!graph.nodes?.length) {
      throw new Error('Workflow has no nodes. Add nodes to the canvas first.');
    }

    // Compute topological execution order
    const executionOrder = topologicalSort(graph);

    // Create a Run record in Postgres for each node
    const runs = await Promise.all(
      executionOrder.map((nodeId) => {
        const nodeDef = graph.nodes.find((n) => n.id === nodeId);
        return this.prisma.run.create({
          data: {
            workflowId,
            nodeId,
            status: 'queued',
            inputsJson: (nodeDef?.data?.config as any) ?? {},
          },
        });
      }),
    );

    // Push ONLY entry-point nodes (those with 0 incoming edges) to BullMQ
    // This starts the reactive DAG execution.
    const entryRunIds = runs
      .filter((r) => {
        const incoming = graph.edges?.filter((e) => e.target === r.nodeId) || [];
        return incoming.length === 0;
      })
      .map((r) => r.id);

    for (const runId of entryRunIds) {
      const run = runs.find(r => r.id === runId)!;
      await this.runsQueue.add(
        'execute-node',
        {
          runId: run.id,
          workflowId,
          nodeId: run.nodeId,
          nodeType: graph.nodes.find(n => n.id === run.nodeId)?.data.nodeType || (graph.nodes.find(n => n.id === run.nodeId)?.data as any).kind
        },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        },
      );
    }

    return {
      message: `Triggered workflow ${workflowId} (${entryRunIds.length} entry nodes started)`,
      runIds: runs.map((r) => r.id),
      entryRunIds,
      executionOrder,
    };
  }

  // ── Get all runs for a workflow ──────────────────────────────────────────────
  async findByWorkflow(workflowId: string) {
    return this.prisma.run.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Get a single run (for polling) ──────────────────────────────────────────
  async findOne(runId: string) {
    const run = await this.prisma.run.findUnique({ where: { id: runId } });
    if (!run) throw new NotFoundException(`Run ${runId} not found`);
    return run;
  }

  // ── Get logs for a run ──────────────────────────────────────────────────────
  async findLogs(runId: string) {
    return this.prisma.runLog.findMany({
      where: { runId },
      orderBy: { startedAt: 'asc' },
    });
  }

  // ── Dynamically resolve inputs for a run from parent outputs ────────────────
  async resolveInputs(runId: string) {
    const run = await this.findOne(runId);
    const workflow = await this.workflowsService.findOne(run.workflowId);
    
    const graph = workflow.jsonGraph as {
      nodes: { id: string; data: { config: unknown } }[];
      edges: { source: string; target: string; sourceHandle?: string; targetHandle?: string }[];
    };

    if (!graph.edges) return run.inputsJson || {};

    // Find parent nodes
    const incomingEdges = graph.edges.filter(e => e.target === run.nodeId);
    const parentNodeIds = incomingEdges.map(e => e.source);

    if (parentNodeIds.length === 0) return run.inputsJson || {};

    // Fetch parent runs
    const parentRuns = await this.prisma.run.findMany({
      where: {
        workflowId: run.workflowId,
        nodeId: { in: parentNodeIds },
        status: 'completed',
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`[resolveInputs] Found ${parentRuns.length} completed parent runs for node ${run.nodeId}`);

    // Merge outputs
    const resolvedInputs: Record<string, any> = {
      ...(typeof run.inputsJson === 'object' && run.inputsJson !== null ? run.inputsJson : {})
    };

    for (const edge of incomingEdges) {
      const parentRun = parentRuns.find(pr => pr.nodeId === edge.source);
      if (parentRun && parentRun.outputsJson && typeof parentRun.outputsJson === 'object') {
        const outputs = parentRun.outputsJson as Record<string, any>;
        
        if (edge.targetHandle || (edge as any).targetInput) {
          const targetField = edge.targetHandle || (edge as any).targetInput;
          const sourceField = edge.sourceHandle || 'value'; // Default to 'value' or 'text'
          
          console.log(`[resolveInputs] Mapping parent ${parentRun.nodeId}.${sourceField} -> child ${run.nodeId}.${targetField}`);
          resolvedInputs[targetField] = outputs[sourceField] || outputs['text'] || outputs['value'];
        } else {
          // Legacy behavior: merge all
          console.log(`[resolveInputs] Merging all outputs from parent ${parentRun.nodeId}`);
          Object.assign(resolvedInputs, outputs);
        }
      }
    }

    // Phase 3.3: Memory Layer Injection
    const memories = await this.prisma.memory.findMany({
      where: { workflowId: run.workflowId, type: 'context' }
    });

    if (memories.length > 0) {
      const contextText = memories.map(m => m.value).join('\n');
      resolvedInputs.workspace_context = contextText;
    }

    console.log(`[resolveInputs] Final resolved inputs for node ${run.nodeId}:`, JSON.stringify(resolvedInputs, null, 2));

    return resolvedInputs;
  }

  // ── Poll all runs for a workflow (used by frontend SDK) ─────────────────────
  async pollStatus(workflowId: string) {
    const runs = await this.findByWorkflow(workflowId);
    const total = runs.length;
    const completed = runs.filter((r) => r.status === 'completed').length;
    const failed = runs.filter((r) => r.status === 'failed').length;
    const running = runs.filter((r) => r.status === 'running').length;
    const queued = runs.filter((r) => r.status === 'queued').length;

    return {
      workflowId,
      total,
      completed,
      failed,
      running,
      queued,
      skipped: runs.filter((r) => r.status === 'skipped').length,
      isFinished: completed + failed + runs.filter((r) => r.status === 'skipped').length === total && total > 0,
      runs: runs.map(r => ({
        id: r.id,
        nodeId: r.nodeId,
        status: r.status,
        attempt: r.attempt,
        inputs: r.inputsJson,
        outputs: r.outputsJson,
        error: r.errorJson,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
      })),
    };
  }

  // ── Self-Correction Loop: Retry upstream node with feedback ────────────────
  async retryBackward(failedRunId: string, feedback: string) {
    const failedRun = await this.findOne(failedRunId);
    const workflow = await this.workflowsService.findOne(failedRun.workflowId);
    
    const graph = workflow.jsonGraph as {
      nodes: { id: string; data: any }[];
      edges: { source: string; target: string }[];
      config?: { maxRetryAttempts?: number };
    };

    if (!graph.edges) return null;

    // Find the edge pointing to the failed QA node
    const edge = graph.edges.find(e => e.target === failedRun.nodeId);
    if (!edge) return null;

    const sourceNodeId = edge.source;

    // Find the latest run for the source node
    const sourceRun = await this.prisma.run.findFirst({
      where: { workflowId: failedRun.workflowId, nodeId: sourceNodeId },
      orderBy: { createdAt: 'desc' }
    });

    if (!sourceRun) return null;

    // Configurable retry limit: read from workflow graph config, default to 3
    const maxAttempts = graph.config?.maxRetryAttempts ?? 3;

    if (sourceRun.attempt >= maxAttempts) {
      console.warn(`[Self-Correction] Node ${sourceNodeId} exhausted max attempts (${maxAttempts}).`);
      return null;
    }

    // Prepare inputs with feedback
    const originalInputs = typeof sourceRun.inputsJson === 'object' && sourceRun.inputsJson !== null ? sourceRun.inputsJson : {};
    const newInputs = {
      ...originalInputs,
      qa_feedback: feedback
    };

    // Create a new versioned attempt run
    const newRun = await this.prisma.run.create({
      data: {
        workflowId: sourceRun.workflowId,
        nodeId: sourceNodeId,
        status: 'queued',
        inputsJson: newInputs,
        attempt: sourceRun.attempt + 1,
        previousRunId: sourceRun.id
      }
    });

    // Enqueue the job
    await this.runsQueue.add(
      'execute-node',
      {
        runId: newRun.id,
        workflowId: newRun.workflowId,
        nodeId: newRun.nodeId,
        nodeType: graph.nodes.find(n => n.id === newRun.nodeId)?.data.nodeType || (graph.nodes.find(n => n.id === newRun.nodeId)?.data as any).kind
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 }
      }
    );

    return newRun;
  }

  // ── Complete a run and trigger downstream nodes (Parallel DAG) ───────────────
  async completeRun(runId: string, body: { status: 'completed' | 'failed', outputsJson?: any, errorJson?: any }) {
    const updated = await this.prisma.run.update({
      where: { id: runId },
      data: {
        status: body.status,
        finishedAt: new Date(),
        ...(body.outputsJson && { outputsJson: body.outputsJson }),
        ...(body.errorJson && { errorJson: body.errorJson }),
      },
    });

    if (body.status === 'failed') {
      // Propagate failure: mark ALL downstream descendants as 'skipped'
      await this.propagateFailure(updated.workflowId, updated.nodeId);
      return { run: updated };
    }

    console.log(`[completeRun] Node ${updated.nodeId} completed for workflow ${updated.workflowId}. Checking children...`);

    // Find children in the workflow graph
    const workflow = await this.workflowsService.findOne(updated.workflowId);
    const graph = workflow.jsonGraph as {
      nodes: { id: string; data: any }[];
      edges: { source: string; target: string }[];
    };

    if (!graph.edges) return { run: updated };

    const childNodeIds = graph.edges
      .filter((e) => e.source === updated.nodeId)
      .map((e) => e.target);

    console.log(`[completeRun] Found ${childNodeIds.length} children for node ${updated.nodeId}: ${childNodeIds.join(', ')}`);

    const triggeredNodes: string[] = [];

    for (const childNodeId of childNodeIds) {
      // Find all parents of this child (uniqued to handle multiple edges from same parent)
      const parentNodeIds = [...new Set(graph.edges
        .filter((e) => e.target === childNodeId)
        .map((e) => e.source))];

      // Check if all parents are completed
      const parentRuns = await this.prisma.run.findMany({
        where: {
          workflowId: updated.workflowId,
          nodeId: { in: parentNodeIds },
          status: 'completed',
        },
      });

      console.log(`[completeRun] Child ${childNodeId} needs parents: ${parentNodeIds.join(', ')}. Found ${parentRuns.length} completed.`);

      if (parentRuns.length >= parentNodeIds.length) {
        // All dependencies met! Enqueue the child.
        const childRun = await this.prisma.run.findFirst({
          where: { workflowId: updated.workflowId, nodeId: childNodeId, status: 'queued' },
          orderBy: { createdAt: 'desc' }
        });

        if (childRun) {
          console.log(`[completeRun] Triggering child ${childNodeId} (Run ID: ${childRun.id})`);
          await this.runsQueue.add(
            'execute-node',
            {
              runId: childRun.id,
              workflowId: updated.workflowId,
              nodeId: childNodeId,
              nodeType: graph.nodes.find(n => n.id === childNodeId)?.data.nodeType || (graph.nodes.find(n => n.id === childNodeId)?.data as any).kind
            },
            {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            }
          );
          triggeredNodes.push(childNodeId);
        } else {
          console.warn(`[completeRun] Child ${childNodeId} parents ready, but no 'queued' run found!`);
        }
      }
    }

    return { run: updated, triggeredNodes };
  }

  // ── Error Propagation: BFS-mark all downstream descendants as skipped ──────
  private async propagateFailure(workflowId: string, failedNodeId: string) {
    const workflow = await this.workflowsService.findOne(workflowId);
    const graph = workflow.jsonGraph as {
      nodes: { id: string; data: any }[];
      edges: { source: string; target: string }[];
    };

    const descendants = this.getDescendants(graph, failedNodeId);

    for (const descendantId of descendants) {
      await this.prisma.run.updateMany({
        where: { workflowId, nodeId: descendantId, status: 'queued' },
        data: {
          status: 'skipped',
          finishedAt: new Date(),
          errorJson: {
            type: 'DEPENDENCY_FAILED',
            message: `Skipped: upstream node '${failedNodeId}' failed`,
            failedAncestor: failedNodeId,
          },
        },
      });
    }

    console.log(`[propagateFailure] Marked ${descendants.length} downstream nodes as skipped due to '${failedNodeId}' failure`);
  }

  private getDescendants(graph: { edges: { source: string; target: string }[] }, nodeId: string): string[] {
    const visited = new Set<string>();
    const queue = [nodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = (graph.edges || [])
        .filter(e => e.source === current)
        .map(e => e.target);

      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          queue.push(child);
        }
      }
    }

    return Array.from(visited);
  }
}
