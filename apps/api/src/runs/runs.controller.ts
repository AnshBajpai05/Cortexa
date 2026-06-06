import { Controller, Get, Post, Param, Body, Sse, MessageEvent } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { RunsService } from './runs.service';
import { RunEventsService } from './run-events.service';

@Controller('runs')
export class RunsController {
  constructor(
    private readonly runsService: RunsService,
    private readonly runEvents: RunEventsService,
  ) {}

  // GET /api/runs/events/:workflowId  (Server-Sent Events)
  // Live stream of node status changes — replaces 5s polling for the canvas.
  @Sse('events/:workflowId')
  events(@Param('workflowId') workflowId: string): Observable<MessageEvent> {
    return this.runEvents.stream(workflowId).pipe(
      map((data) => ({ data }) as MessageEvent),
    );
  }

  // POST /api/runs/trigger/:workflowId
  // Called by the frontend "Run" button via the SDK
  @Post('trigger/:workflowId')
  trigger(@Param('workflowId') workflowId: string) {
    return this.runsService.trigger(workflowId);
  }

  // GET /api/runs/status/:workflowId
  // Polled every 5s by the frontend SDK to check pipeline progress
  @Get('status/:workflowId')
  pollStatus(@Param('workflowId') workflowId: string) {
    return this.runsService.pollStatus(workflowId);
  }

  // GET /api/runs/:runId/resolved-inputs
  // Returns dynamically resolved inputs from parent nodes
  @Get(':runId/resolved-inputs')
  resolveInputs(@Param('runId') runId: string) {
    return this.runsService.resolveInputs(runId);
  }

  // GET /api/runs/:runId
  // Get details of a single run (used to display node output)
  @Get(':runId')
  findOne(@Param('runId') runId: string) {
    return this.runsService.findOne(runId);
  }

  // GET /api/runs/:runId/logs
  // Get granular execution logs for a run
  @Get(':runId/logs')
  findLogs(@Param('runId') runId: string) {
    return this.runsService.findLogs(runId);
  }

  // POST /api/runs/:runId/retry-backward
  // Triggered by the Worker when QA fails, initiating the Self-Correction Loop
  @Post(':runId/retry-backward')
  retryBackward(
    @Param('runId') runId: string,
    @Body('feedback') feedback: string,
  ) {
    return this.runsService.retryBackward(runId, feedback);
  }
}
