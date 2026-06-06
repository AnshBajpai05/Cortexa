import { Controller, Post, Body } from '@nestjs/common';
import { AgentGatewayService } from './agent-gateway.service';

@Controller('agent')
export class AgentController {
  constructor(private readonly agentGateway: AgentGatewayService) {}

  @Post('run')
  async run(@Body() body: { prompt: string }) {
    if (!body.prompt || body.prompt.trim().length === 0) {
      return { error: 'Prompt is required' };
    }
    return this.agentGateway.run(body.prompt);
  }
}
