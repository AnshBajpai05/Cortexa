import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { RunsModule } from '../runs/runs.module';

@Module({
  imports: [RunsModule],
  controllers: [InternalController],
})
export class InternalModule {}
