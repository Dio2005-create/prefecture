import { useRef, useState, type ReactNode } from 'react';
import { FileText, LoaderCircle } from 'lucide-react';
import { usePreferences } from '../preferences';

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  const { t } = usePreferences();
  return <div className="page-intro"><div><p className="eyebrow">{t(eyebrow)}</p><h1>{t(title)}</h1><p>{t(description)}</p></div>{action}</div>;
}

export function Status({ status }: { status: string }) {
  const { t } = usePreferences();
  const labels: Record<string, string> = { VALIDE: 'Indexé', EN_TRAITEMENT: 'En traitement', BROUILLON: 'Brouillon', ARCHIVE: 'Archivé', ERREUR: 'Erreur' };
  return <span className={`status ${status.toLowerCase()}`}><i />{t(labels[status] ?? status)}</span>;
}

export function Empty({ text }: { text: string }) { const { t } = usePreferences(); return <div className="empty"><FileText size={22} /><p>{t(text)}</p></div>; }
export function Loading() { const { t } = usePreferences(); return <div className="loading">{t('Chargement des archives…')}</div>; }
export function LoadingPage() {
  const { t } = usePreferences();
  return (
    <main className="loading-page" role="status" aria-live="polite">
      <div className="loading-page-card">
        <LoaderCircle className="loading-page-spinner" aria-hidden="true" />
        <p>{t('Chargement de votre espace…')}</p>
      </div>
    </main>
  );
}
export function ErrorState({ message = 'Le service n’est pas disponible. Vérifiez le backend local.' }: { message?: string }) { const { t } = usePreferences(); return <div className="error-state">{t(message)}</div>; }
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
  const { t } = usePreferences();
  return toast ? <div className={`toast toast-${toast.kind}`} role="status">{t(toast.message)}</div> : null;
}
export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  const { t } = usePreferences();
  if (totalPages <= 1) return null;
  return <div className="pagination" aria-label={t('Pagination')}><button className="button small" disabled={page === 1} onClick={() => onChange(page - 1)}>{t('Précédent')}</button><span>{t('Page {{page}} sur {{totalPages}}', { page, totalPages })}</span><button className="button small" disabled={page === totalPages} onClick={() => onChange(page + 1)}>{t('Suivant')}</button></div>;
}
