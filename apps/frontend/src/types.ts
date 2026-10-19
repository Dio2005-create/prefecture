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

export type FirearmRequestType =
  | 'HOLDING_PERMIT'
  | 'CARRY_PERMIT'
  | 'REGISTER_FIREARM'
  | 'RENEW_PERMIT'
  | 'DEREGISTER_FIREARM'
  | 'TRANSFER_FIREARM';

export interface FirearmRecord {
  id: string;
  weaponType: string;
  brand: string;
  model: string;
  serialNumber: string;
  caliber: string | null;
  acquiredAt: string;
  origin: string;
  isActive: boolean;
  createdAt: string;
  permits?: FirearmPermitRecord[];
  history?: Array<{ action: string; details: Record<string, unknown>; createdAt: string }>;
}

export interface FirearmPermitRecord {
  id: string;
  type: 'HOLDING' | 'CARRY';
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'REPLACED';
  issuedAt: string;
  expiresAt: string;
  firearm?: Pick<FirearmRecord, 'id' | 'weaponType' | 'brand' | 'model' | 'serialNumber'> | null;
}

export interface FirearmRequestRecord {
  id: string;
  type: FirearmRequestType;
  status: 'PENDING' | 'IN_REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  data: Record<string, unknown>;
  decisionComment?: string | null;
  decidedAt?: string | null;
  createdAt: string;
  user?: { id: string; nom: string | null; email: string | null; phone: string | null; cin: string | null };
  firearm?: Pick<FirearmRecord, 'id' | 'weaponType' | 'brand' | 'model' | 'serialNumber' | 'caliber' | 'isActive'> | null;
  attachments: Array<{ id: string; label: string; originalName: string; mimeType?: string | null; size?: number | null; createdAt: string }>;
  issuedPermit?: FirearmPermitRecord | null;
  history?: Array<{ action: string; details: Record<string, unknown>; createdAt: string; actor?: { id: string; nom: string | null } | null }>;
}

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
  appointments?: Array<{ id: string; startsAt: string; endsAt: string; office: string; status: string }>;
  attachments?: Array<{ id: string; label?: string; originalName: string; mimeType?: string; size?: number; createdAt: string }>;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  status: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface CitizenComplaint {
  id: string;
  reason: string;
  details?: string | null;
  status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
  adminResponse?: string | null;
  createdAt: string;
  documentRequest: {
    id: string;
    title: string | null;
    type: string;
    service: { nameFr: string; nameMg?: string };
    formData?: Record<string, unknown> | null;
  };
  attachments: Array<{ id: string; originalName: string; mimeType?: string | null; size?: number | null; createdAt?: string }>;
  user?: { id: string; nom: string | null; email: string | null; phone?: string | null };
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
  fields: Array<{ name: string; label: string; type: 'text' | 'textarea' | 'number' | 'date' | 'select'; required: boolean; options?: string[] }>;
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
