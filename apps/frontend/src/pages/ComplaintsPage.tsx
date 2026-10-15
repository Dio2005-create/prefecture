import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Download, FileWarning, ShieldCheck } from 'lucide-react';
import { usePreferences } from '../preferences';
import { complaintService, prefectureService } from '../services/api';
import type { CitizenComplaint } from '../types';

async function errorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;
    const parsedData = responseData instanceof Blob
      ? await responseData.text().then((text) => {
        try { return JSON.parse(text) as { message?: string | string[] }; } catch { return undefined; }
      })
      : responseData as { message?: string | string[] } | undefined;
    const message = parsedData?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return error instanceof Error ? error.message : fallback;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const complaintStatusLabels: Record<CitizenComplaint['status'], string> = {
  PENDING: 'En attente',
  IN_REVIEW: 'En cours de traitement',
  RESOLVED: 'Document corrigé et redélivré',
  REJECTED: 'Refusée',
};

export function CitizenComplaintsPage() {
  const { t, language } = usePreferences();
  const client = useQueryClient();
  const [documentRequestId, setDocumentRequestId] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const { data: documents = [], isLoading: documentsLoading, isError: documentsError } = useQuery({
    queryKey: ['complaint-documents'],
    queryFn: complaintService.eligibleDocuments,
  });
  const { data: complaints = [], isLoading: complaintsLoading, isError: complaintsError } = useQuery({
    queryKey: ['citizen-complaints'],
    queryFn: complaintService.list,
  });
  const createMutation = useMutation({
    mutationFn: complaintService.create,
    onSuccess: async () => {
      setDocumentRequestId('');
      setReason('');
      setDetails('');
      setFile(null);
      setError('');
      await client.invalidateQueries({ queryKey: ['citizen-complaints'] });
      await client.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (mutationError) => { void errorMessage(mutationError, 'La réclamation n’a pas pu être envoyée.').then(setError); },
  });

  const submit = () => {
    setError('');
    if (!documentRequestId || !reason.trim() || !file) {
      setError(t('Sélectionnez un document, indiquez le motif et joignez un justificatif.'));
      return;
    }
    createMutation.mutate({ documentRequestId, reason: reason.trim(), details: details.trim() || undefined, file });
  };

  const downloadDocument = async (id: string, title: string) => {
    try {
      downloadBlob(await prefectureService.downloadCorrectedPdf(id), `${title || 'document-corrige'}.pdf`);
    } catch (downloadError) {
      setError(await errorMessage(downloadError, 'Le document ne peut pas être téléchargé.'));
    }
  };
  const downloadAttachment = async (complaintId: string, attachmentId: string, name: string) => {
    try {
      downloadBlob(await complaintService.downloadAttachment(complaintId, attachmentId), name);
    } catch (downloadError) {
      setError(await errorMessage(downloadError, 'Le justificatif ne peut pas être téléchargé.'));
    }
  };

  return <section className="panel complaint-page" style={{ padding: 24 }}>
    <p className="eyebrow">{t('Médiation citoyenne')}</p>
    <h1>{t('Réclamations')}</h1>
    <p>{t('Signalez une erreur sur un document déjà délivré. L’administration pourra corriger les informations et vous remettre un document mis à jour.')}</p>
    <section className="complaint-form">
      <h2>{t('Déposer une réclamation')}</h2>
      {documentsError && <p className="error-message" role="alert">{t('Impossible de charger vos documents délivrés.')}</p>}
      {documents.length === 0 && !documentsLoading && !documentsError
        ? <p className="muted">{t('Aucun document délivré ne peut actuellement faire l’objet d’une réclamation en ligne.')}</p>
        : <div className="request-form-grid">
          <label className="request-field full-width">{t('Document délivré concerné')} *
            <select value={documentRequestId} onChange={(event) => setDocumentRequestId(event.target.value)} disabled={documentsLoading}>
              <option value="">{t(documentsLoading ? 'Chargement...' : 'Choisir un document')}</option>
              {documents.map((document) => <option key={document.id} value={document.id}>
                {document.title ?? (language === 'mg' ? document.service.nameMg : document.service.nameFr)} — {new Date(document.updatedAt).toLocaleDateString(language === 'mg' ? 'mg-MG' : 'fr-FR')}
              </option>)}
            </select>
          </label>
          <label className="request-field full-width">{t('Motif de la réclamation')} *
            <input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} placeholder={t('Ex. : erreur dans le nom ou le prénom')} />
          </label>
          <label className="request-field full-width">{t('Détails utiles (facultatif)')}
            <textarea rows={4} maxLength={5000} value={details} onChange={(event) => setDetails(event.target.value)} />
          </label>
          <label className="request-field full-width">{t('Copie du document où se trouve l’erreur (PDF, JPG ou PNG, 10 Mo maximum)')} *
            <input type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            {file && <small>{file.name} · {Math.ceil(file.size / 1024)} Ko</small>}
          </label>
        </div>}
      {error && <p className="error-message" role="alert">{t(error)}</p>}
      <button className="button primary" type="button" disabled={documents.length === 0 || createMutation.isPending} onClick={submit}>
        {t(createMutation.isPending ? 'Envoi...' : 'Envoyer ma réclamation')}
      </button>
    </section>

    <section className="complaint-history">
      <h2>{t('Mes réclamations')}</h2>
      {complaintsLoading ? <p role="status">{t('Chargement...')}</p> : complaintsError ? (
        <p className="error-message" role="alert">{t('Impossible de charger vos réclamations.')}</p>
      ) : complaints.length === 0 ? (
        <div className="empty-state"><FileWarning size={26} /><span>{t('Vous n’avez pas encore envoyé de réclamation.')}</span></div>
      ) : <div className="complaint-list">{complaints.map((complaint) => <article className="recent-row" key={complaint.id}>
        <ShieldCheck size={18} />
        <span>
          <strong>{complaint.documentRequest.title ?? complaint.documentRequest.service.nameFr}</strong>
          <small>{t('Motif')} : {complaint.reason} · {new Date(complaint.createdAt).toLocaleDateString(language === 'mg' ? 'mg-MG' : 'fr-FR')}</small>
          {complaint.adminResponse && <small>{t('Réponse de l’administration')} : {complaint.adminResponse}</small>}
          {complaint.attachments.map((attachment) => <button className="text-link" type="button" key={attachment.id} onClick={() => void downloadAttachment(complaint.id, attachment.id, attachment.originalName)}><Download size={14} /> {t('Voir le justificatif')} — {attachment.originalName}</button>)}
        </span>
        <span className={`status ${complaint.status === 'RESOLVED' ? 'valide' : complaint.status === 'REJECTED' ? 'erreur' : 'en_traitement'}`}>{t(complaintStatusLabels[complaint.status])}</span>
        {complaint.status === 'RESOLVED' && <button className="button small" type="button" onClick={() => void downloadDocument(complaint.documentRequest.id, complaint.documentRequest.title ?? 'document-corrige')}><Download size={14} /> {t('Télécharger le document corrigé')}</button>}
      </article>)}</div>}
    </section>
  </section>;
}

export function AdminComplaintsPage() {
  const { t } = usePreferences();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState('');
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const originalCorrections = useRef<Record<string, string>>({});
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const { data: complaints = [], isLoading, isError } = useQuery({
    queryKey: ['admin-complaints'],
    queryFn: complaintService.listAdmin,
  });
  const selected = complaints.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!selected) return;
    const fields = selected.documentRequest.formData ?? {};
    const initialValues = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value === null || typeof value === 'object' ? '' : String(value)]));
    originalCorrections.current = initialValues;
    setCorrections(initialValues);
    setResponse('');
    setError('');
  }, [selectedId]);

  const refresh = async () => {
    await client.invalidateQueries({ queryKey: ['admin-complaints'] });
    await client.invalidateQueries({ queryKey: ['notifications'] });
  };
  const reviewMutation = useMutation({ mutationFn: complaintService.markInReview, onSuccess: refresh, onError: (mutationError) => { void errorMessage(mutationError, 'Impossible de mettre la réclamation en instruction.').then(setError); } });
  const resolveMutation = useMutation({
    mutationFn: () => {
      const changedFields = Object.fromEntries(
        Object.entries(corrections).filter(([key, value]) => value !== originalCorrections.current[key]),
      );
      return complaintService.resolve(selectedId, changedFields, response);
    },
    onSuccess: async () => { setSelectedId(''); setError(''); await refresh(); },
    onError: (mutationError) => { void errorMessage(mutationError, 'La correction du document a échoué.').then(setError); },
  });
  const rejectMutation = useMutation({
    mutationFn: () => complaintService.reject(selectedId, response),
    onSuccess: async () => { setSelectedId(''); setError(''); await refresh(); },
    onError: (mutationError) => { void errorMessage(mutationError, 'La réclamation n’a pas pu être refusée.').then(setError); },
  });

  const downloadAttachment = async (complaintId: string, attachmentId: string, name: string) => {
    try {
      downloadBlob(await complaintService.downloadAttachment(complaintId, attachmentId), name);
    } catch (downloadError) {
      setError(await errorMessage(downloadError, 'Le justificatif ne peut pas être téléchargé.'));
    }
  };

  return <section className="panel complaint-page" style={{ padding: 24 }}>
    <p className="eyebrow">{t('Back-Office préfecture')}</p>
    <h1>{t('Traitement des réclamations')}</h1>
    <p>{t('Vérifiez le document délivré, appliquez les corrections demandées, puis redélivrez le document corrigé.')}</p>
    {isLoading ? <p>{t('Chargement...')}</p> : isError ? <p className="error-message" role="alert">{t('Impossible de charger les réclamations.')}</p> : complaints.length === 0 ? (
      <div className="empty-state"><FileWarning size={26} /><span>{t('Aucune réclamation à traiter.')}</span></div>
    ) : <div className="complaint-admin-layout">
      <div className="complaint-admin-list">{complaints.map((complaint) => <button className={`complaint-admin-item${selectedId === complaint.id ? ' is-selected' : ''}`} type="button" key={complaint.id} onClick={() => setSelectedId(complaint.id)}>
        <strong>{complaint.documentRequest.title ?? complaint.documentRequest.service.nameFr}</strong>
        <small>{complaint.user?.nom ?? complaint.user?.email ?? complaint.user?.phone} · {t(complaintStatusLabels[complaint.status])}</small>
        <small>{complaint.reason}</small>
      </button>)}</div>
      {selected && <section className="complaint-admin-detail">
        <h2>{t('Réclamation')} — {selected.documentRequest.title ?? selected.documentRequest.service.nameFr}</h2>
        <p><strong>{t('Citoyen')} :</strong> {selected.user?.nom ?? selected.user?.email ?? selected.user?.phone}</p>
        <p><strong>{t('Motif')} :</strong> {selected.reason}</p>
        {selected.details && <p><strong>{t('Détails')} :</strong> {selected.details}</p>}
        <h3>{t('Justificatifs transmis')}</h3>
        {selected.attachments.map((attachment) => <button className="button small" type="button" key={attachment.id} onClick={() => void downloadAttachment(selected.id, attachment.id, attachment.originalName)}><Download size={14} /> {attachment.originalName}</button>)}
        <h3>{t('Corriger les informations du document')}</h3>
        <div className="request-form-grid">{Object.entries(corrections).map(([key, value]) => <label className="request-field" key={key}>{t(key)}
          <input value={value} onChange={(event) => setCorrections((current) => ({ ...current, [key]: event.target.value }))} />
        </label>)}</div>
        <label className="request-field full-width">{t('Réponse au citoyen')} *
          <textarea rows={3} value={response} onChange={(event) => setResponse(event.target.value)} />
        </label>
        {error && <p className="error-message" role="alert">{t(error)}</p>}
        <div className="complaint-admin-actions">
          {selected.status === 'PENDING' && <button className="button" type="button" disabled={reviewMutation.isPending} onClick={() => reviewMutation.mutate(selected.id)}>{t('Prendre en charge')}</button>}
          {selected.status !== 'RESOLVED' && selected.status !== 'REJECTED' && <>
            <button className="button danger" type="button" disabled={rejectMutation.isPending || resolveMutation.isPending} onClick={() => rejectMutation.mutate()}>{t('Refuser la réclamation')}</button>
            <button className="button primary" type="button" disabled={resolveMutation.isPending || rejectMutation.isPending} onClick={() => resolveMutation.mutate()}>{t(resolveMutation.isPending ? 'Enregistrement...' : 'Enregistrer la correction et redélivrer')}</button>
          </>}
        </div>
      </section>}
    </div>}
  </section>;
}
