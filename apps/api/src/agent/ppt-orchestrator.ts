import { Logger } from '@nestjs/common';

export interface SemanticChunk {
  title: string;
  content: string;
  category?: string;
  importance: number; // 0-1
}

export const PPT_CATEGORIES = [
  "problem",
  "overview",
  "architecture",
  "components",
  "workflow",
  "models",
  "data",
  "evaluation",
  "setup",
  "results",
  "governance",
  "future",
  "misc"
];

export const CANONICAL_ORDER = [
  "problem",
  "overview",
  "architecture",
  "workflow",
  "components",
  "models",
  "data",
  "results",
  "governance",
  "setup",
  "future",
  "misc"
];

export class PptOrchestrator {
  private static readonly logger = new Logger('PptOrchestrator');

  /**
   * Phase 1: Structure-aware chunking
   */
  static chunkReadme(text: string): SemanticChunk[] {
    const lines = text.split('\n');
    const chunks: SemanticChunk[] = [];
    let currentTitle = 'Introduction';
    let currentLines: string[] = [];

    for (const line of lines) {
      const match = line.match(/^#+\s+(.*)/);
      if (match) {
        if (currentLines.length > 0) {
          chunks.push({
            title: currentTitle,
            content: currentLines.join('\n').trim(),
            importance: this.calculateImportance(currentLines.join('\n')),
          });
        }
        currentTitle = match[1].trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0 || currentTitle !== 'Introduction') {
      chunks.push({
        title: currentTitle,
        content: currentLines.join('\n').trim(),
        importance: this.calculateImportance(currentLines.join('\n')),
      });
    }

    return chunks;
  }

  private static calculateImportance(text: string): number {
    // Simple heuristic: length + presence of keywords
    const keywords = ['architecture', 'security', 'model', 'results', 'critical', 'setup'];
    let score = text.length / 2000; // base score by length
    keywords.forEach(k => {
      if (text.toLowerCase().includes(k)) score += 0.2;
    });
    return Math.min(1, score);
  }

  /**
   * Phase 3: Semantic Assembly
   */
  static assemble(chunks: SemanticChunk[]): Record<string, SemanticChunk[]> {
    const grouped: Record<string, SemanticChunk[]> = {};
    
    // Group by category
    chunks.forEach(chunk => {
      const cat = chunk.category || 'misc';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(chunk);
    });

    return grouped;
  }

  /**
   * Generate a reassembled narrative prompt for the Slide Architect
   */
  static getReassembledPrompt(grouped: Record<string, SemanticChunk[]>): string {
    let prompt = "NARRATIVE FLOW FOR PRESENTATION:\n\n";
    
    for (const cat of CANONICAL_ORDER) {
      if (grouped[cat] && grouped[cat].length > 0) {
        prompt += `[CATEGORY: ${cat.toUpperCase()}]\n`;
        grouped[cat].forEach(chunk => {
          prompt += `### ${chunk.title}\n${chunk.content}\n\n`;
        });
        prompt += `---\n`;
      }
    }

    return prompt;
  }
}
