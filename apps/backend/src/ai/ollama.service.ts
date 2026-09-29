import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { EmbeddingService, LlmService } from './ai.types';

@Injectable()
export class OllamaService implements EmbeddingService, LlmService {
  private readonly baseUrl = process.env.OLLAMA_URL ?? 'http://host.docker.internal:11434';
  private readonly embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL ?? 'nomic-embed-text';
  private readonly chatModel = process.env.OLLAMA_CHAT_MODEL ?? 'mistral';

  async vectoriser(texte: string): Promise<number[]> {
    const response = await this.request('/api/embeddings', {
      model: this.embeddingModel,
      prompt: texte,
    });
    return response.embedding as number[];
  }

  async generer(prompt: string): Promise<string> {
    const response = await this.request('/api/generate', {
      model: this.chatModel,
      prompt,
      stream: false,
    });
    return response.response as string;
  }

  private async request(path: string, body: object): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      throw new ServiceUnavailableException('Le service Ollama local est indisponible', { cause: error });
    }
  }
}
