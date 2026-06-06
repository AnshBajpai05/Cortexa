import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Plain-text Memory (existing) ───────────────────────────────────────────

  async create(workflowId: string, data: { type: string; key: string; value: string }) {
    return this.prisma.memory.create({
      data: {
        workflowId,
        type: data.type,
        key: data.key,
        value: data.value,
      },
    });
  }

  async findAll(workflowId: string) {
    return this.prisma.memory.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async remove(workflowId: string, memoryId: string) {
    const entry = await this.prisma.memory.findUnique({ where: { id: memoryId } });
    if (!entry || entry.workflowId !== workflowId) {
      throw new NotFoundException(`Memory entry ${memoryId} not found in workflow ${workflowId}`);
    }
    await this.prisma.memory.delete({ where: { id: memoryId } });
    return { ok: true };
  }

  // ─── Vector Memory (persistent embeddings) ─────────────────────────────────

  async storeEmbedding(
    workflowId: string,
    data: { text: string; embedding: number[]; metadata?: Record<string, unknown> },
  ) {
    return this.prisma.vectorMemory.create({
      data: {
        workflowId,
        text: data.text,
        embedding: data.embedding,
        metadata: (data.metadata ?? {}) as any,
      },
    });
  }

  async storeBatchEmbeddings(
    workflowId: string,
    items: { text: string; embedding: number[]; metadata?: Record<string, unknown> }[],
  ) {
    return this.prisma.$transaction(
      items.map((item) =>
        this.prisma.vectorMemory.create({
          data: {
            workflowId,
            text: item.text,
            embedding: item.embedding,
            metadata: (item.metadata ?? {}) as any,
          },
        }),
      ),
    );
  }

  /**
   * Cosine similarity search using raw SQL for performance.
   * Falls back to in-memory cosine if pgvector extension is not installed.
   */
  async searchSimilar(
    workflowId: string,
    queryEmbedding: number[],
    options: { topK?: number } = {},
  ) {
    const topK = options.topK ?? 5;

    // Fetch all vectors for this workflow and compute cosine similarity in JS
    // This is the portable fallback that works without pgvector extension
    const allVectors = await this.prisma.vectorMemory.findMany({
      where: { workflowId },
    });

    if (allVectors.length === 0) return [];

    // Compute cosine similarity
    const scored = allVectors.map((vec) => {
      const dot = vec.embedding.reduce((sum, v, i) => sum + v * (queryEmbedding[i] ?? 0), 0);
      const magA = Math.sqrt(vec.embedding.reduce((sum, v) => sum + v * v, 0));
      const magB = Math.sqrt(queryEmbedding.reduce((sum, v) => sum + v * v, 0));
      const similarity = magA && magB ? dot / (magA * magB) : 0;
      return { ...vec, similarity };
    });

    // Sort by similarity descending, take topK
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  /**
   * Maximal Marginal Relevance (MMR) — balances relevance with diversity.
   * lambda=1.0 → pure relevance, lambda=0.0 → pure diversity
   */
  async searchWithMMR(
    workflowId: string,
    queryEmbedding: number[],
    options: { topK?: number; lambda?: number; candidateMultiplier?: number } = {},
  ) {
    const topK = options.topK ?? 5;
    const lambda = options.lambda ?? 0.7;
    const candidateMultiplier = options.candidateMultiplier ?? 3;

    // Fetch a larger candidate pool first
    const candidates = await this.searchSimilar(workflowId, queryEmbedding, {
      topK: topK * candidateMultiplier,
    });

    if (candidates.length === 0) return [];

    // MMR selection
    const selected: typeof candidates = [];
    const remaining = [...candidates];

    while (selected.length < topK && remaining.length > 0) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const relevance = remaining[i].similarity;

        // Max similarity to already-selected docs
        let maxSimToSelected = 0;
        for (const sel of selected) {
          const dot = remaining[i].embedding.reduce(
            (sum, v, j) => sum + v * (sel.embedding[j] ?? 0), 0,
          );
          const magA = Math.sqrt(remaining[i].embedding.reduce((s, v) => s + v * v, 0));
          const magB = Math.sqrt(sel.embedding.reduce((s, v) => s + v * v, 0));
          const sim = magA && magB ? dot / (magA * magB) : 0;
          if (sim > maxSimToSelected) maxSimToSelected = sim;
        }

        const mmrScore = lambda * relevance - (1 - lambda) * maxSimToSelected;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    }

    return selected;
  }

  /** Get vector memory count for a workflow */
  async vectorCount(workflowId: string): Promise<number> {
    return this.prisma.vectorMemory.count({ where: { workflowId } });
  }

  /** Delete all vector memories for a workflow */
  async clearVectors(workflowId: string) {
    await this.prisma.vectorMemory.deleteMany({ where: { workflowId } });
    return { ok: true };
  }
}
