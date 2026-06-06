import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  // POST /api/metrics — record a metric from the worker
  @Post()
  record(
    @Body() body: {
      runId: string;
      nodeId: string;
      model?: string;
      latencyMs: number;
      tokenCount?: number;
      costEstimate?: number;
      attempt?: number;
      success?: boolean;
    },
  ) {
    return this.metricsService.record(body);
  }

  // GET /api/metrics/workflow/:workflowId — aggregated workflow metrics
  @Get('workflow/:workflowId')
  getWorkflowMetrics(@Param('workflowId') workflowId: string) {
    return this.metricsService.getWorkflowMetrics(workflowId);
  }

  // GET /api/metrics/workflow/:workflowId/dashboard — UI-shaped payload
  @Get('workflow/:workflowId/dashboard')
  getDashboard(@Param('workflowId') workflowId: string) {
    return this.metricsService.getDashboard(workflowId);
  }

  // GET /api/metrics/workflow/:workflowId/nodes — per-node metrics
  @Get('workflow/:workflowId/nodes')
  getNodeMetrics(@Param('workflowId') workflowId: string) {
    return this.metricsService.getNodeMetrics(workflowId);
  }
}
