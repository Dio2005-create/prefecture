export interface TextChunk {
  contenu: string;
  position: number;
}

export interface SearchHit {
  chunkId: string;
  documentId: string;
  contenu: string;
  score: number;
}

export interface EmbeddingService {
  vectoriser(texte: string): Promise<number[]>;
}

export interface LlmService {
  generer(prompt: string): Promise<string>;
}

export interface OcrService {
  extraireTexte(cheminFichier: string): Promise<string>;
}
