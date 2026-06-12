import {
  Controller, Post, Param, Body, Headers, UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface WorkerCallbackDto {
  status: 'completed' | 'failed';
  outputsJson?: Record<string, unknown>;
  errorJson?: Record<string, unknown>;
}

/**
 * Internal-only controller.
 * Receives POST callbacks from the Worker when a node finishes execution.
 * Protected by a shared secret header to prevent external abuse.
 */
import { RunsService } from '../runs/runs.service';
import { RunEventsService } from '../runs/run-events.service';

@Controller('internal')
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runsService: RunsService,
    private readonly runEvents: RunEventsService,
  ) {}

  // ── T1-6: fail-closed secret check ─────────────────────────────────────────
  // Previously `'' === ''` passed when env was unset on both sides → open API.
  private assertInternalSecret(secret: string | undefined) {
    const expected = process.env.INTERNAL_WEBHOOK_SECRET;
    if (!expected || expected.trim() === '') {
      throw new UnauthorizedException('INTERNAL_WEBHOOK_SECRET is not configured — internal API is fail-closed');
    }
    if (secret !== expected) {
      throw new UnauthorizedException('Invalid internal webhook secret');
    }
  }

  // POST /api/internal/runs/:runId
  @Post('runs/:runId')
  async handleWorkerCallback(
    @Param('runId') runId: string,
    @Body() body: WorkerCallbackDto,
    @Headers('x-internal-secret') secret: string,
  ) {
    this.assertInternalSecret(secret);

    // ── Update and trigger downstream ────────────────────────────────────────
    const result = await this.runsService.completeRun(runId, body);

    console.log(`📬 Run ${runId} → ${body.status}`);
    return { ok: true, ...result };
  }

  // POST /api/internal/runs/:runId/logs
  @Post('runs/:runId/logs')
  async handleWorkerLog(
    @Param('runId') runId: string,
    @Body() body: {
      nodeId: string;
      status: string;
      inputJson?: any;
      outputJson?: any;
      errorJson?: any;
    },
    @Headers('x-internal-secret') secret: string,
  ) {
    this.assertInternalSecret(secret);

    const log = await this.prisma.runLog.create({
      data: {
        runId,
        nodeId: body.nodeId,
        status: body.status,
        ...(body.inputJson && { inputJson: body.inputJson }),
        ...(body.outputJson && { outputJson: body.outputJson }),
        ...(body.errorJson && { errorJson: body.errorJson }),
        finishedAt: body.status !== 'started' ? new Date() : null,
      },
    });

    // §4.5 fix: Run.status was never set to 'running' and startedAt was never
    // populated (status jumped queued→completed). Wire it from the worker's
    // 'started' log so polling, the reconciler TTL sweep, and latency metrics
    // all have real data.
    if (body.status === 'started') {
      await this.prisma.run.updateMany({
        where: { id: runId, status: 'queued' },
        data: { status: 'running', startedAt: new Date() },
      });
    }

    // ── Publish to SSE subscribers (live canvas) ─────────────────────────────
    try {
      const run = await this.prisma.run.findUnique({
        where: { id: runId },
        select: { workflowId: true },
      });
      if (run?.workflowId) {
        this.runEvents.publish(run.workflowId, {
          runId,
          nodeId: body.nodeId,
          status: body.status,
          outputJson: body.outputJson,
          errorJson: body.errorJson,
        });
      }
    } catch (err) {
      // SSE is best-effort; never fail the log write because of it
    }

    return { ok: true, logId: log.id };
  }
}
