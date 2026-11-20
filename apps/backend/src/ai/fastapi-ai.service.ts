import { GatewayTimeoutException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

@Injectable()
export class FastApiAiService {
  private readonly baseUrl = process.env.AI_SERVICE_URL ?? 'http://ai-service:8000';

  async vectoriser(text: string): Promise<number[]> {
    const result = await this.request('/embeddings', { text });
    return result.embedding as number[];
  }

  async generer(prompt: string): Promise<string> {
    const result = await this.request('/generate', { prompt });
    return String(result.response ?? '');
  }

  async classifier(text: string, categories: string[]) {
    return this.request('/classify', { text, categories });
  }

  async extraireTexte(path: string, filename: string): Promise<string> {
    try {
      const form = new FormData();
      form.append('file', new Blob([await readFile(path)]), filename);
      const response = await fetch(`${this.baseUrl}/ocr`, { method: 'POST', body: form });
      if (!response.ok) throw new Error(`FastAPI returned ${response.status}: ${await response.text()}`);
      const result = await response.json() as { text?: string };
      return result.text?.trim() ?? '';
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Erreur inconnue';
      throw new ServiceUnavailableException(`Extraction OCR indisponible (${reason})`, { cause: error });
    }
  }

  private async request(path: string, body: object): Promise<Record<string, unknown>> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(80_000),
      });
      if (!response.ok) {
        const detail = await response.text();
        if (response.status === 504) {
          throw new GatewayTimeoutException('Le traitement IA a dépassé le délai autorisé');
        }
        throw new Error(`FastAPI returned ${response.status}: ${detail}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new GatewayTimeoutException('Le service IA n’a pas répondu dans le délai autorisé', { cause: error });
      }
      const reason = error instanceof Error ? error.message : 'Erreur inconnue';
      throw new ServiceUnavailableException(`Le service IA FastAPI est indisponible (${reason})`, { cause: error });
    }
  }
}
