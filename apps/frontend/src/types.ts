export type DocumentType = 'ACTE' | 'ARRETE' | 'COURRIER' | 'AUTRE';
export type DocumentStatus = 'BROUILLON' | 'EN_TRAITEMENT' | 'VALIDE' | 'ARCHIVE' | 'ERREUR';
export type RequestType =
  | 'BIRTH_CERTIFICATE'
  | 'RESIDENCE_CERTIFICATE'
  | 'NATIONALITY_CERTIFICATE'
  | 'CIN_REQUEST'
  | 'CIN_RENEWAL'
  | 'GOOD_CHARACTER_CERTIFICATE'
  | 'BUILDING_PERMIT'
  | 'LAND_STATUS'
  | 'COMMERCIAL_LICENSE'
  | 'VEHICLE_REGISTRATION'
  | 'LOSS_DECLARATION'
  | 'SIGNATURE_LEGALIZATION'
  | 'COMPLAINT'
  | 'SPECIAL_REQUEST'
  | 'ASSOCIATION_DECLARATION'
  | 'EVENT_AUTHORIZATION'
  | 'ACCREDITATION'
  | 'ADMINISTRATIVE_AUTHORIZATION';

export interface Category {
  id: string;
  libelle: string;
  description?: string;
}

export interface Chunk {
  id: string;
  contenu: string;
  position: number;
  page?: number;
}

export interface PrefectureService {
  id: string;
  code: string;
  nameFr: string;
  nameMg: string;
  description?: string;
  isActive: boolean;
}

export interface CitizenRequest {
  id: string;
  title?: string;
  status: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  fee?: number | string;
  description?: string;
  formData?: Record<string, unknown>;
  service: PrefectureService;
  user?: {
    id: string;
    email: string;
    nom?: string;
    phone?: string;
    cin?: string;
  };
  history?: Array<{ status: string; comment?: string; createdAt: string }>;
  attachments?: Array<{ id: string; label?: string; originalName: string; mimeType?: string; size?: number; createdAt: string }>;
}

export interface RequestAttachmentRequirement {
  key: string;
  label: string;
  required: boolean;
  multiple?: boolean;
  minFiles?: number;
  pairGroup?: string;
}

export interface RequestRequirements {
  fields: Array<{ name: string; label: string; type: 'text' | 'textarea' | 'number' | 'date'; required: boolean }>;
  attachments: RequestAttachmentRequirement[];
}

export interface Document {
  id: string;
  titre: string;
  reference?: string;
  type: DocumentType;
  date?: string;
  serviceEmetteur?: string;
  auteurEmetteur?: string;
  statut: DocumentStatus;
  etapeTraitement?: string;
  erreurTraitement?: string;
  contenuTexte?: string;
  scoreClassification?: number;
  methodeClassification?: 'AUTOMATIQUE' | 'IA' | 'MANUELLE';
  categorie?: Category;
  chunks?: Chunk[];
  _count?: { chunks: number };
  createdAt: string;
}

export interface SearchHit {
  chunkId: string;
  documentId: string;
  contenu: string;
  score: number;
}

export interface RagResponse {
  id: string;
  conversationId: string;
  reponse: string;
  sources: SearchHit[];
}

export interface ChatHistoryMessage {
  id: string;
  texte: string;
  reponseGeneree?: string | null;
  date: string;
}

export interface ChatConversation {
  id: string;
  titre: string;
  updatedAt: string;
  messages: ChatHistoryMessage[];
}

export interface PaginatedDocuments {
  items: Document[];
  total: number;
  page: number;
  limit: number;
}
