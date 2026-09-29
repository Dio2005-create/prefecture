import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SearchHit } from './ai.types';

@Injectable()
export class QdrantService {
  private readonly baseUrl = process.env.QDRANT_URL ?? 'http://qdrant:6333';
  private readonly collection = process.env.QDRANT_COLLECTION ?? 'archives_prefecture';

  async indexer(points: Array<{ id: string; vector: number[]; payload: object }>): Promise<void> {
    if (points.length > 0) await this.ensureCollection(points[0].vector.length);
    await this.request(`/collections/${this.collection}/points`, 'PUT', {
      points: points.map((point) => ({ id: point.id, vector: point.vector, payload: point.payload })),
    });
  }

  private async ensureCollection(size: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/collections/${this.collection}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vectors: { size, distance: 'Cosine' } }),
    });
    if (!response.ok && response.status !== 409) {
      throw new ServiceUnavailableException(`Impossible de créer la collection Qdrant (${response.status})`);
    }
  }

  async rechercher(vector: number[], topK: number): Promise<SearchHit[]> {
    const response = await this.request(`/collections/${this.collection}/points/search`, 'POST', {
      vector,
      limit: topK,
      with_payload: true,
    });
    const results = (response.result ?? []) as Array<{ id: string; score: number; payload?: Record<string, unknown> }>;
    return results.map((result) => ({
      chunkId: String(result.id),
      documentId: String(result.payload?.documentId ?? ''),
      contenu: String(result.payload?.contenu ?? ''),
      score: result.score,
    }));
  }

  async supprimerDocument(documentId: string): Promise<void> {
    await this.request(`/collections/${this.collection}/points/delete`, 'POST', {
      filter: { must: [{ key: 'documentId', match: { value: documentId } }] },
    });
  }

  private async request(path: string, method: 'POST' | 'PUT', body: object): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`Qdrant returned ${response.status}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      throw new ServiceUnavailableException('La base vectorielle Qdrant est indisponible', { cause: error });
    }
  }
}
