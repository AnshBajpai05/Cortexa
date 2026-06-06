import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { MemoryService } from './memory.service';

@Controller('workflows/:workflowId/memory')
export class MemoryController {
  constructor(private readonly memoryService: MemoryService) {}

  // ─── Plain-text Memory ──────────────────────────────────────────────────────

  // GET /api/workflows/:workflowId/memory
  @Get()
  findAll(@Param('workflowId') workflowId: string) {
    return this.memoryService.findAll(workflowId);
  }

  // POST /api/workflows/:workflowId/memory
  @Post()
  create(
    @Param('workflowId') workflowId: string,
    @Body() body: { type: string; key: string; value: string },
  ) {
    return this.memoryService.create(workflowId, body);
  }

  // DELETE /api/workflows/:workflowId/memory/:memoryId
  @Delete(':memoryId')
  remove(
    @Param('workflowId') workflowId: string,
    @Param('memoryId') memoryId: string,
  ) {
    return this.memoryService.remove(workflowId, memoryId);
  }

  // ─── Vector Memory ─────────────────────────────────────────────────────────

  // POST /api/workflows/:workflowId/memory/vectors
  @Post('vectors')
  storeEmbedding(
    @Param('workflowId') workflowId: string,
    @Body() body: { text: string; embedding: number[]; metadata?: Record<string, unknown> },
  ) {
    return this.memoryService.storeEmbedding(workflowId, body);
  }

  // POST /api/workflows/:workflowId/memory/vectors/batch
  @Post('vectors/batch')
  storeBatch(
    @Param('workflowId') workflowId: string,
    @Body() body: { items: { text: string; embedding: number[]; metadata?: Record<string, unknown> }[] },
  ) {
    return this.memoryService.storeBatchEmbeddings(workflowId, body.items);
  }

  // POST /api/workflows/:workflowId/memory/vectors/search
  @Post('vectors/search')
  searchSimilar(
    @Param('workflowId') workflowId: string,
    @Body() body: { embedding: number[]; topK?: number; useMMR?: boolean; lambda?: number },
  ) {
    if (body.useMMR) {
      return this.memoryService.searchWithMMR(workflowId, body.embedding, {
        topK: body.topK,
        lambda: body.lambda,
      });
    }
    return this.memoryService.searchSimilar(workflowId, body.embedding, {
      topK: body.topK,
    });
  }

  // GET /api/workflows/:workflowId/memory/vectors/count
  @Get('vectors/count')
  vectorCount(@Param('workflowId') workflowId: string) {
    return this.memoryService.vectorCount(workflowId);
  }

  // DELETE /api/workflows/:workflowId/memory/vectors
  @Delete('vectors')
  clearVectors(@Param('workflowId') workflowId: string) {
    return this.memoryService.clearVectors(workflowId);
  }
}
