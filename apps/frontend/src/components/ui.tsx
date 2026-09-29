import { useRef, useState, type ReactNode } from 'react';
import { FileText } from 'lucide-react';

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export function Status({ status }: { status: string }) {
  const labels: Record<string, string> = { VALIDE: 'Indexé', EN_TRAITEMENT: 'En traitement', BROUILLON: 'Brouillon', ARCHIVE: 'Archivé', ERREUR: 'Erreur' };
  return <span className={`status ${status.toLowerCase()}`}><i />{labels[status] ?? status}</span>;
}

export function Empty({ text }: { text: string }) { return <div className="empty"><FileText size={22} /><p>{text}</p></div>; }
export function Loading() { return <div className="loading">Chargement des archives…</div>; }
export function ErrorState({ message = 'Le service n’est pas disponible. Vérifiez le backend local.' }: { message?: string }) { return <div className="error-state">{message}</div>; }
export type ToastKind = 'success' | 'error';
export function useToast() {
  const [toast, setToast] = useState<{ kind: ToastKind; message: string } | null>(null);
  const timeoutRef = useRef<number | undefined>(undefined);
  const notify = (kind: ToastKind, message: string) => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setToast({ kind, message });
    timeoutRef.current = window.setTimeout(() => setToast(null), 5000);
  };
  return { toast, notify };
}
export function Toast({ toast }: { toast: { kind: ToastKind; message: string } | null }) {
  return toast ? <div className={`toast toast-${toast.kind}`} role="status">{toast.message}</div> : null;
}
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return <div className="pagination" aria-label="Pagination"><button className="button small" disabled={page === 1} onClick={() => onChange(page - 1)}>Précédent</button><span>Page {page} sur {totalPages}</span><button className="button small" disabled={page === totalPages} onClick={() => onChange(page + 1)}>Suivant</button></div>;
}
