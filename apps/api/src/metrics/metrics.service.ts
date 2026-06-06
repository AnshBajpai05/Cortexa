import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface WorkflowMetrics {
  workflowId: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  totalCost: number;
  retryRate: number;
  avgAttempts: number;
  modelBreakdown: Record<string, { count: number; avgLatencyMs: number; totalTokens: number }>;
}

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Record a metric after node execution */
  async record(data: {
    runId: string;
    nodeId: string;
    model?: string;
    latencyMs: number;
    tokenCount?: number;
    costEstimate?: number;
    attempt?: number;
    success?: boolean;
  }) {
    return this.prisma.runMetric.create({
      data: {
        runId: data.runId,
        nodeId: data.nodeId,
        model: data.model ?? null,
        latencyMs: data.latencyMs,
        tokenCount: data.tokenCount ?? 0,
        costEstimate: data.costEstimate ?? 0,
        attempt: data.attempt ?? 1,
        success: data.success ?? true,
      },
    });
  }

  /** Aggregate metrics for a workflow */
  async getWorkflowMetrics(workflowId: string): Promise<WorkflowMetrics> {
    // Get all runs for this workflow
    const runs = await this.prisma.run.findMany({
      where: { workflowId },
      include: { metrics: true },
    });

    const allMetrics = runs.flatMap((r) => r.metrics);
    const totalRuns = allMetrics.length;
    const successCount = allMetrics.filter((m) => m.success).length;
    const failureCount = totalRuns - successCount;

    const totalLatency = allMetrics.reduce((sum, m) => sum + m.latencyMs, 0);
    const totalTokens = allMetrics.reduce((sum, m) => sum + (m.tokenCount ?? 0), 0);
    const totalCost = allMetrics.reduce((sum, m) => sum + (m.costEstimate ?? 0), 0);

    // Retry rate: % of runs with attempt > 1
    const retriedRuns = allMetrics.filter((m) => m.attempt > 1).length;
    const totalAttempts = allMetrics.reduce((sum, m) => sum + m.attempt, 0);

    // Model breakdown
    const modelBreakdown: Record<string, { count: number; avgLatencyMs: number; totalTokens: number }> = {};
    for (const m of allMetrics) {
      const model = m.model ?? "unknown";
      if (!modelBreakdown[model]) {
        modelBreakdown[model] = { count: 0, avgLatencyMs: 0, totalTokens: 0 };
      }
      modelBreakdown[model].count++;
      modelBreakdown[model].totalTokens += m.tokenCount ?? 0;
      modelBreakdown[model].avgLatencyMs += m.latencyMs;
    }
    // Average out latencies
    for (const model of Object.keys(modelBreakdown)) {
      modelBreakdown[model].avgLatencyMs = Math.round(
        modelBreakdown[model].avgLatencyMs / modelBreakdown[model].count,
      );
    }

    return {
      workflowId,
      totalRuns,
      successCount,
      failureCount,
      successRate: totalRuns > 0 ? successCount / totalRuns : 0,
      avgLatencyMs: totalRuns > 0 ? Math.round(totalLatency / totalRuns) : 0,
      totalTokens,
      totalCost: Math.round(totalCost * 10000) / 10000,
      retryRate: totalRuns > 0 ? retriedRuns / totalRuns : 0,
      avgAttempts: totalRuns > 0 ? Math.round((totalAttempts / totalRuns) * 100) / 100 : 1,
      modelBreakdown,
    };
  }

  /** Get per-node metrics for a specific workflow */
  async getNodeMetrics(workflowId: string) {
    const runs = await this.prisma.run.findMany({
      where: { workflowId },
      include: { metrics: true },
    });

    const nodeMap: Record<string, {
      nodeId: string;
      runs: number;
      successes: number;
      avgLatencyMs: number;
      totalLatencyMs: number;
      totalTokens: number;
      model: string | null;
    }> = {};

    for (const run of runs) {
      for (const m of run.metrics) {
        if (!nodeMap[m.nodeId]) {
          nodeMap[m.nodeId] = {
            nodeId: m.nodeId,
            runs: 0,
            successes: 0,
            avgLatencyMs: 0,
            totalLatencyMs: 0,
            totalTokens: 0,
            model: null,
          };
        }
        nodeMap[m.nodeId].runs++;
        if (m.success) nodeMap[m.nodeId].successes++;
        nodeMap[m.nodeId].totalLatencyMs += m.latencyMs;
        nodeMap[m.nodeId].totalTokens += m.tokenCount ?? 0;
        nodeMap[m.nodeId].model = m.model;
      }
    }

    return Object.values(nodeMap).map((n) => ({
      ...n,
      avgLatencyMs: Math.round(n.totalLatencyMs / n.runs),
      avgTokens: Math.round(n.totalTokens / n.runs),
      successRate: n.runs > 0 ? n.successes / n.runs : 0,
    }));
  }

  /**
   * Single-call dashboard payload shaped for the AnalyticsPanel UI.
   * (summary + per-node + per-model breakdowns)
   */
  async getDashboard(workflowId: string) {
    const m = await this.getWorkflowMetrics(workflowId);
    const nodes = await this.getNodeMetrics(workflowId);

    return {
      summary: {
        avgLatency: m.avgLatencyMs,
        totalTokens: m.totalTokens,
        successRate: m.successRate,
        totalCost: m.totalCost,
        retryRate: m.retryRate,
        avgAttempts: m.avgAttempts,
      },
      nodeBreakdown: nodes.map((n) => ({
        nodeId: n.nodeId,
        avgLatency: n.avgLatencyMs,
        avgTokens: (n as any).avgTokens ?? 0,
        successRate: n.successRate,
        model: n.model,
      })),
      modelBreakdown: Object.entries(m.modelBreakdown).map(([model, v]) => ({
        model,
        count: v.count,
        avgLatencyMs: v.avgLatencyMs,
        totalTokens: v.totalTokens,
      })),
    };
  }
}
