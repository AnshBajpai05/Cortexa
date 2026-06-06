import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { RunsModule } from './runs/runs.module';
import { InternalModule } from './internal/internal.module';
import { MemoryModule } from './memory/memory.module';
import { MetricsModule } from './metrics/metrics.module';
import { AgentModule } from './agent/agent.module';

@Module({
  imports: [
    // ── Config: load .env globally ──────────────────────────────────────────
    ConfigModule.forRoot({ isGlobal: true }),

    // ── BullMQ: connect to Redis ─────────────────────────────────────────────
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),

    // ── Feature Modules ──────────────────────────────────────────────────────
    PrismaModule,
    WorkflowsModule,
    RunsModule,
    InternalModule,
    MemoryModule,
    MetricsModule,
    AgentModule,
  ],
})
export class AppModule {}
