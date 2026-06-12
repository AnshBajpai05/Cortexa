import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { RunsService } from './runs.service';

/**
 * T1-4: Reconciliation watchdog.
 *
 * The DAG advances via a chain of HTTP callbacks (worker → internal webhook →
 * completeRun → enqueue children). A single dropped POST used to stall the
 * workflow forever — no watchdog existed. This service sweeps periodically and
 * repairs the two stall classes:
 *
 *   1. STUCK RUNNING — run marked 'running' longer than TTL (worker died,
 *      lock expired, callback lost). Marked failed via completeRun so failure
 *      propagation + SSE fire normally.
 *
 *   2. SATISFIED-BUT-UNENQUEUED — run still 'queued' past a grace period
 *      although every parent in its execution has completed (or it is an
 *      entry node whose trigger enqueue was lost). Re-enqueued with
 *      jobId = runId, so if the original job still exists BullMQ dedupes —
 *      re-enqueue is idempotent and safe.
 *
 * Pre-generation rows (executionId = 'legacy') are ignored so the sweep can
 * never resurrect ancient runs.
 */
@Injectable()
export class ReconcilerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Reconciler');
  private timer: NodeJS.Timeout | null = null;

  private readonly intervalMs = Number(process.env.RECONCILER_INTERVAL_MS || 60_000);
  /** running longer than this = presumed dead (worker lock is 10 min) */
  private readonly runningTtlMs = Number(process.env.RECONCILER_RUNNING_TTL_MS || 15 * 60_000);
  /** queued grace period before we suspect a lost enqueue */
  private readonly queuedGraceMs = Number(process.env.RECONCILER_QUEUED_GRACE_MS || 2 * 60_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowsService: WorkflowsService,
    private readonly runsService: RunsService,
    @InjectQueue('runs') private readonly runsQueue: Queue,
  ) {}

  onModuleInit() {
    if (process.env.RECONCILER_DISABLED === 'true') {
      this.logger.warn('Reconciler disabled via RECONCILER_DISABLED=true');
      return;
    }
    this.timer = setInterval(() => {
      this.sweep().catch((err) => this.logger.error(`Sweep failed: ${err.message}`));
    }, this.intervalMs);
    // Don't keep the process alive just for the reconciler
    this.timer.unref?.();
    this.logger.log(`Armed: interval=${this.intervalMs}ms runningTtl=${this.runningTtlMs}ms queuedGrace=${this.queuedGraceMs}ms`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<{ timedOut: number; requeued: number }> {
    const [timedOut, requeued] = await Promise.all([
      this.sweepStuckRunning(),
      this.sweepUnenqueued(),
    ]);
    if (timedOut || requeued) {
      this.logger.warn(`Repaired: ${timedOut} timed-out run(s), ${requeued} re-enqueued run(s)`);
    }
    return { timedOut, requeued };
  }

  // ── 1. Stuck RUNNING past TTL → fail through the normal path ────────────────
  private async sweepStuckRunning(): Promise<number> {
    const cutoff = new Date(Date.now() - this.runningTtlMs);
    const stuck = await this.prisma.run.findMany({
      where: {
        status: 'running',
        executionId: { not: 'legacy' },
        startedAt: { lt: cutoff },
      },
      take: 50,
    });

    for (const run of stuck) {
      this.logger.warn(`Run ${run.id} (node ${run.nodeId}) running since ${run.startedAt?.toISOString()} — timing out.`);
      // completeRun handles status update + failure propagation + return shape
      await this.runsService.completeRun(run.id, {
        status: 'failed',
        errorJson: {
          type: 'RECONCILER_TIMEOUT',
          message: `Run exceeded running TTL (${this.runningTtlMs}ms); worker presumed dead or callback lost.`,
        },
      });
    }
    return stuck.length;
  }

  // ── 2. QUEUED with satisfied dependencies past grace → re-enqueue ───────────
  private async sweepUnenqueued(): Promise<number> {
    const cutoff = new Date(Date.now() - this.queuedGraceMs);
    const staleQueued = await this.prisma.run.findMany({
      where: {
        status: 'queued',
        executionId: { not: 'legacy' },
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    if (!staleQueued.length) return 0;

    // Cache graphs per workflow to avoid refetch per run
    const graphCache = new Map<string, any>();
    let requeued = 0;

    for (const run of staleQueued) {
      let graph = graphCache.get(run.workflowId);
      if (!graph) {
        try {
          const wf = await this.workflowsService.findOne(run.workflowId);
          graph = wf.jsonGraph as any;
          graphCache.set(run.workflowId, graph);
        } catch {
          continue; // workflow deleted — orphan runs are inert, skip
        }
      }

      const parentNodeIds: string[] = [
        ...new Set(
          ((graph.edges ?? []) as { source: string; target: string }[])
            .filter((e) => e.target === run.nodeId)
            .map((e) => e.source),
        ),
      ];

      if (parentNodeIds.length > 0) {
        const completedParents = await this.prisma.run.findMany({
          where: {
            workflowId: run.workflowId,
            executionId: run.executionId,
            nodeId: { in: parentNodeIds },
            status: 'completed',
          },
          select: { nodeId: true },
        });
        const done = new Set(completedParents.map((r) => r.nodeId));
        if (done.size < parentNodeIds.length) continue; // genuinely waiting
      }

      // Entry node or all parents complete → enqueue should have happened.
      // jobId=runId makes this idempotent: if the job exists, BullMQ no-ops.
      const nodeDef = (graph.nodes ?? []).find((n: any) => n.id === run.nodeId);
      await this.runsQueue.add(
        'execute-node',
        {
          runId: run.id,
          workflowId: run.workflowId,
          nodeId: run.nodeId,
          nodeType: nodeDef?.data?.nodeType || nodeDef?.data?.kind,
        },
        {
          jobId: run.id,
          attempts: 1,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
      this.logger.warn(`Re-enqueued run ${run.id} (node ${run.nodeId}, exec ${run.executionId.slice(0, 8)}…) — dependencies satisfied but no job observed.`);
      requeued++;
    }
    return requeued;
  }
}
