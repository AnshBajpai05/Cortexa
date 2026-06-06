import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentGatewayService } from './agent-gateway.service';
import { WorkflowsModule } from '../workflows/workflows.module';
import { RunsModule } from '../runs/runs.module';

@Module({
  imports: [WorkflowsModule, RunsModule],
  controllers: [AgentController],
  providers: [AgentGatewayService],
  exports: [AgentGatewayService],
})
export class AgentModule {}
