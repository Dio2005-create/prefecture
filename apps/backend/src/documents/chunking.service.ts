import { Injectable } from '@nestjs/common';
import { TextChunk } from '../ai/ai.types';

@Injectable()
export class ChunkingService {
  private readonly chunkSize = 1800;
  private readonly overlap = 200;

  decouper(texte: string): TextChunk[] {
    const normalized = texte.replace(/\s+/g, ' ').trim();
    if (!normalized) return [];

    const chunks: TextChunk[] = [];
    let start = 0;
    let position = 0;
    while (start < normalized.length) {
      const end = Math.min(start + this.chunkSize, normalized.length);
      chunks.push({ contenu: normalized.slice(start, end), position });
      if (end === normalized.length) break;
      start = end - this.overlap;
      position += 1;
    }
    return chunks;
  }
}
