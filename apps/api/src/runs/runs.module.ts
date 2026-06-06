import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RunsController } from './runs.controller';
import { RunsService } from './runs.service';
import { RunEventsService } from './run-events.service';
import { WorkflowsModule } from '../workflows/workflows.module';

@Module({
  imports: [
    // Register the 'runs' queue — must match the queue name in the Worker
    BullModule.registerQueue({ name: 'runs' }),
    WorkflowsModule,
  ],
  controllers: [RunsController],
  providers: [RunsService, RunEventsService],
  exports: [RunsService, RunEventsService],
})
export class RunsModule {}
