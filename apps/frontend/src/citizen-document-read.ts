const STORAGE_PREFIX = 'e-servisy:read-delivered-documents:';
export const CITIZEN_DOCUMENT_READ_EVENT = 'citizen-delivered-document-read';

export function citizenDocumentReadKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function getReadCitizenDocuments(userId: string): string[] {
  if (!userId || typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(citizenDocumentReadKey(userId)) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

export function markCitizenDocumentsRead(userId: string, requestIds: string[]) {
  if (!userId || requestIds.length === 0 || typeof window === 'undefined') return;
  const readIds = new Set([...getReadCitizenDocuments(userId), ...requestIds]);
  window.localStorage.setItem(citizenDocumentReadKey(userId), JSON.stringify([...readIds].slice(-500)));
  window.dispatchEvent(new Event(CITIZEN_DOCUMENT_READ_EVENT));
}
