import { useState, type FormEvent } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Search, ShieldCheck } from 'lucide-react';
import { firearmsService } from '../services/api';
import type { FirearmRequestRecord } from '../types';
import { Pagination } from '../components/ui';
import { usePreferences } from '../preferences';

const requestLabels: Record<string, string> = {
  HOLDING_PERMIT: 'Permis de détention',
  CARRY_PERMIT: 'Permis de port',
  REGISTER_FIREARM: 'Enregistrement d’une arme',
  RENEW_PERMIT: 'Renouvellement de permis',
  DEREGISTER_FIREARM: 'Radiation d’une arme',
  TRANSFER_FIREARM: 'Cession / transfert',
};
const statusLabels: Record<string, string> = {
  PENDING: 'En attente',
  IN_REVIEW: 'En instruction',
  NEEDS_INFO: 'Complément demandé',
  APPROVED: 'Validée',
  REJECTED: 'Rejetée',
  ACTIVE: 'Actif',
  EXPIRED: 'Expiré',
  REVOKED: 'Révoqué',
  REPLACED: 'Remplacé',
};
const permitTypes = ['HOLDING_PERMIT', 'CARRY_PERMIT', 'RENEW_PERMIT'];
const PAGE_SIZE = 5;

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return error instanceof Error ? error.message : 'Une erreur est survenue.';
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function AdminFirearmsPage() {
  const { t } = usePreferences();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState('');
  const [requestPage, setRequestPage] = useState(1);
  const [serial, setSerial] = useState('');
  const [selectedCitizenId, setSelectedCitizenId] = useState('');
  const [dossierFirearmPage, setDossierFirearmPage] = useState(1);
  const [dossierRequestPage, setDossierRequestPage] = useState(1);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [expirations, setExpirations] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const { data: stats, isError: statsError } = useQuery({
    queryKey: ['firearms-admin-stats'],
    queryFn: firearmsService.stats,
  });
  const { data: requests = [], isLoading, isError } = useQuery({
    queryKey: ['firearms-admin-requests', filter],
    queryFn: () => firearmsService.listAdminRequests(filter || undefined),
    refetchInterval: 30000,
  });
  const dossierQuery = useQuery({
    queryKey: ['firearms-citizen-dossier', selectedCitizenId],
    queryFn: () => firearmsService.getDossier(selectedCitizenId),
    enabled: Boolean(selectedCitizenId),
  });
  const searchMutation = useMutation({
    mutationFn: () => firearmsService.searchBySerial(serial.trim()),
    onError: (error: unknown) => setActionError(errorMessage(error)),
  });
  const decisionMutation = useMutation({
    mutationFn: ({ request, status }: { request: FirearmRequestRecord; status: 'IN_REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' }) => {
      const comment = comments[request.id]?.trim() ?? '';
      if (['NEEDS_INFO', 'REJECTED'].includes(status) && !comment) throw new Error('Ajoutez un commentaire pour demander un complément ou rejeter le dossier.');
      const needsExpiry = status === 'APPROVED' && permitTypes.includes(request.type);
      if (needsExpiry && !expirations[request.id]) throw new Error('Fixez la date d’échéance du permis avant validation.');
      return firearmsService.decideRequest(request.id, {
        status,
        ...(comment ? { comment } : {}),
        ...(needsExpiry ? { expiresAt: expirations[request.id] } : {}),
      });
    },
    onSuccess: async (_, variables) => {
      setActionError('');
      setActionSuccess('La décision a été enregistrée et le citoyen a été notifié.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['firearms-admin-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-navigation-firearm-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['firearms-admin-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['firearms-citizen-dossier', variables.request.user?.id] }),
      ]);
    },
    onError: (error: unknown) => {
      setActionSuccess('');
      setActionError(errorMessage(error));
    },
  });
  const actionableRequests = requests.filter((request) => ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'].includes(request.status));
  const totalRequestPages = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
  const visibleRequests = requests.slice((Math.min(requestPage, totalRequestPages) - 1) * PAGE_SIZE, Math.min(requestPage, totalRequestPages) * PAGE_SIZE);
  const dossierFirearms = dossierQuery.data?.firearms ?? [];
  const dossierRequests = dossierQuery.data?.firearmRequests ?? [];
  const totalDossierFirearmPages = Math.max(1, Math.ceil(dossierFirearms.length / PAGE_SIZE));
  const totalDossierRequestPages = Math.max(1, Math.ceil(dossierRequests.length / PAGE_SIZE));
  const visibleDossierFirearms = dossierFirearms.slice((dossierFirearmPage - 1) * PAGE_SIZE, dossierFirearmPage * PAGE_SIZE);
  const visibleDossierRequests = dossierRequests.slice((dossierRequestPage - 1) * PAGE_SIZE, dossierRequestPage * PAGE_SIZE);

  const openDossier = (citizenId: string) => {
    setSelectedCitizenId(citizenId);
    setDossierFirearmPage(1);
    setDossierRequestPage(1);
  };

  const downloadAttachment = async (requestId: string, attachmentId: string, filename: string) => {
    try {
      downloadFile(await firearmsService.downloadAttachment(requestId, attachmentId), filename);
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };
  const downloadReport = async () => {
    try {
      downloadFile(await firearmsService.downloadReport(), 'rapport-controle-armements.csv');
    } catch (error) {
      setActionError(errorMessage(error));
    }
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setActionError('');
    searchMutation.mutate();
  };
  const decide = (request: FirearmRequestRecord, status: 'IN_REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED') => {
    setActionError('');
    setActionSuccess('');
    decisionMutation.mutate({ request, status });
  };

  return <section className="firearms-page">
    <header className="firearms-heading">
      <div><p className="eyebrow">{t('Administration')}</p><h1>{t('Contrôle des armements')}</h1><p>{t('Instruction des dossiers, recherche de numéros de série, consultation des historiques et rapports.')}</p></div>
      <ShieldCheck size={34} aria-hidden="true" />
    </header>

    {statsError ? <p className="firearms-message is-error" role="alert">{t('Les statistiques sont momentanément indisponibles.')}</p> : <div className="firearms-overview">
      <article><span>{t('Armes enregistrées')}</span><strong>{stats?.firearms ?? '—'}</strong></article>
      <article><span>{t('Armes actives')}</span><strong>{stats?.activeFirearms ?? '—'}</strong></article>
      <article><span>{t('Demandes à traiter')}</span><strong>{stats?.pendingRequests ?? '—'}</strong></article>
      <article><span>{t('Permis actifs')}</span><strong>{stats?.activePermits ?? '—'}</strong></article>
      <article><span>{t('Permis arrivant à échéance (30 j.)')}</span><strong>{stats?.expiringPermits ?? '—'}</strong></article>
    </div>}

    <section className="firearms-panel">
      <div className="firearms-section-heading"><div><p className="eyebrow">{t('Recherche')}</p><h2>{t('Rechercher par numéro de série')}</h2></div></div>
      <form className="firearms-search-form" onSubmit={submitSearch}>
        <input aria-label={t('Numéro de série')} required value={serial} onChange={(event) => setSerial(event.target.value)} placeholder={t('Saisir le numéro de série exact')} />
        <button className="button primary" type="submit" disabled={searchMutation.isPending}><Search size={15} />{searchMutation.isPending ? t('Recherche…') : t('Rechercher')}</button>
        <button className="button" type="button" onClick={() => void downloadReport()}><Download size={15} />{t('Exporter le rapport CSV')}</button>
      </form>
      {searchMutation.data && <article className="firearms-item firearms-search-result">
        <div className="firearms-item-heading"><div><h3>{searchMutation.data.brand} {searchMutation.data.model}</h3><p>{searchMutation.data.weaponType} · {t('N° de série')} {searchMutation.data.serialNumber}</p></div><span className={`firearms-badge ${searchMutation.data.isActive ? 'is-active' : 'is-inactive'}`}>{t(searchMutation.data.isActive ? 'Active' : 'Radiée')}</span></div>
        <p>{t('Propriétaire')}: {searchMutation.data.owner.nom ?? '—'} · CIN {searchMutation.data.owner.cin ?? '—'}</p>
        <button className="text-link" type="button" onClick={() => openDossier(searchMutation.data.owner.id)}>{t('Ouvrir le dossier complet du citoyen')}</button>
        <details className="firearms-history" open><summary>{t('Historique complet de l’arme')}</summary><ol>{searchMutation.data.history.map((entry, index) => <li key={`${entry.action}-${index}`}><strong>{t(entry.action.replace(/_/g, ' '))}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span><p>{displayValue(entry.details)}</p></li>)}</ol></details>
      </article>}
    </section>

    {selectedCitizenId && <section className="firearms-panel">
      <div className="firearms-section-heading"><div><p className="eyebrow">{t('Dossier citoyen')}</p><h2>{dossierQuery.data?.nom ?? t('Chargement du dossier…')}</h2></div><button className="text-link" type="button" onClick={() => setSelectedCitizenId('')}>{t('Fermer')}</button></div>
      {dossierQuery.isError ? <p className="firearms-message is-error">{t('Impossible de charger le dossier citoyen.')}</p> : dossierQuery.data && <>
        <p>{dossierQuery.data.email ?? '—'} · {dossierQuery.data.phone ?? '—'} · CIN {dossierQuery.data.cin ?? '—'}</p>
        <h3>{t('Armes enregistrées')} ({dossierFirearms.length})</h3>
        {dossierFirearms.length === 0 ? <p>{t('Aucune arme enregistrée.')}</p> : <>{visibleDossierFirearms.map((firearm) => <article className="firearms-item" key={firearm.id}>
          <div className="firearms-item-heading"><strong>{firearm.brand} {firearm.model} · {firearm.serialNumber}</strong><span className={`firearms-badge ${firearm.isActive ? 'is-active' : 'is-inactive'}`}>{t(firearm.isActive ? 'Active' : 'Radiée')}</span></div>
          <p>{firearm.weaponType} · {t('Calibre')}: {firearm.caliber ?? '—'} · {t('Origine')}: {firearm.origin}</p>
          {firearm.permits?.map((permit) => <p key={permit.id}>{t(permit.type === 'CARRY' ? 'Permis de port' : 'Permis de détention')}: {t(statusLabels[permit.status] ?? permit.status)} · {new Date(permit.expiresAt).toLocaleDateString()}</p>)}
          {firearm.history?.length ? <details className="firearms-history"><summary>{t('Historique complet')}</summary><ol>{firearm.history.map((entry, index) => <li key={`${entry.action}-${index}`}><strong>{t(entry.action.replace(/_/g, ' '))}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span><p>{displayValue(entry.details)}</p></li>)}</ol></details> : null}
        </article>)}<Pagination page={Math.min(dossierFirearmPage, totalDossierFirearmPages)} totalPages={totalDossierFirearmPages} onChange={setDossierFirearmPage} /></>}
        <h3>{t('Demandes du citoyen')} ({dossierRequests.length})</h3>
        {dossierRequests.length === 0 ? <p>{t('Aucune demande.')}</p> : <>{visibleDossierRequests.map((request) => <article className="firearms-item" key={request.id}>
          <div className="firearms-item-heading"><div><h3>{t(requestLabels[request.type] ?? request.type)}</h3><p>{new Date(request.createdAt).toLocaleString()} · {t('Référence')} {request.id}</p></div><span className={`firearms-badge status-${request.status.toLowerCase()}`}>{t(statusLabels[request.status] ?? request.status)}</span></div>
          {request.firearm && <p>{request.firearm.brand} {request.firearm.model} · {t('N° de série')} {request.firearm.serialNumber}</p>}
          {Object.keys(request.data).length > 0 && <details className="firearms-history"><summary>{t('Données de la demande')}</summary><dl className="firearms-data">{Object.entries(request.data).map(([key, value]) => <div key={key}><dt>{t(key.replace(/([A-Z])/g, ' $1'))}</dt><dd>{displayValue(value)}</dd></div>)}</dl></details>}
          {request.decisionComment && <p className="firearms-decision-comment">{t('Commentaire de décision')}: {request.decisionComment}</p>}
          <div className="firearms-attachments">{request.attachments.map((attachment) => <button className="text-link" type="button" key={attachment.id} onClick={() => void downloadAttachment(request.id, attachment.id, attachment.originalName)}>{t('Télécharger')} · {attachment.label} — {attachment.originalName}</button>)}</div>
          {request.history?.length ? <details className="firearms-history"><summary>{t('Historique de la demande')}</summary><ol>{request.history.map((entry, index) => <li key={`${entry.action}-${index}`}><strong>{t(entry.action.replace(/_/g, ' '))}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span>{entry.actor?.nom && <p>{t('Agent')}: {entry.actor.nom}</p>}{typeof entry.details.comment === 'string' && entry.details.comment && <p>{entry.details.comment}</p>}</li>)}</ol></details> : null}
        </article>)}<Pagination page={Math.min(dossierRequestPage, totalDossierRequestPages)} totalPages={totalDossierRequestPages} onChange={setDossierRequestPage} /></>}
      </>}
    </section>}

    <section className="firearms-panel">
      <div className="firearms-section-heading"><div><p className="eyebrow">{t('Instruction')}</p><h2>{t('Demandes à traiter')} ({actionableRequests.length})</h2></div>
        <select aria-label={t('Filtrer les demandes par statut')} value={filter} onChange={(event) => { setFilter(event.target.value); setRequestPage(1); }}>
          <option value="">{t('Tous les statuts')}</option>
          {Object.entries(statusLabels).filter(([key]) => ['PENDING', 'IN_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED'].includes(key)).map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
        </select>
      </div>
      {actionError && <p className="firearms-message is-error" role="alert">{actionError}</p>}
      {actionSuccess && <p className="firearms-message is-success" role="status">{actionSuccess}</p>}
      {isLoading ? <p>{t('Chargement…')}</p> : isError ? <p className="firearms-message is-error">{t('Impossible de charger les demandes.')}</p> : requests.length === 0 ? <p className="firearms-empty">{t('Aucune demande pour ce filtre.')}</p> : <><div className="firearms-list">
        {visibleRequests.map((request) => <article className="firearms-item" key={request.id}>
          <div className="firearms-item-heading"><div><h3>{t(requestLabels[request.type] ?? request.type)}</h3><p>{request.user?.nom ?? 'Citoyen'} · CIN {request.user?.cin ?? '—'} · {new Date(request.createdAt).toLocaleString()}</p></div><span className={`firearms-badge status-${request.status.toLowerCase()}`}>{t(statusLabels[request.status] ?? request.status)}</span></div>
          {request.firearm && <p>{request.firearm.brand} {request.firearm.model} · {request.firearm.weaponType} · {t('N° de série')} {request.firearm.serialNumber}</p>}
          {Object.keys(request.data).length > 0 && <details className="firearms-history"><summary>{t('Données de la demande')}</summary><dl className="firearms-data">{Object.entries(request.data).map(([key, value]) => <div key={key}><dt>{t(key.replace(/([A-Z])/g, ' $1'))}</dt><dd>{displayValue(value)}</dd></div>)}</dl></details>}
          <div className="firearms-attachments">{request.attachments.map((attachment) => <button className="text-link" type="button" key={attachment.id} onClick={() => void downloadAttachment(request.id, attachment.id, attachment.originalName)}>{t('Télécharger')} · {attachment.label} — {attachment.originalName}</button>)}</div>
          {request.decisionComment && <p className="firearms-decision-comment">{t('Dernier commentaire')}: {request.decisionComment}</p>}
          {['PENDING', 'IN_REVIEW', 'NEEDS_INFO'].includes(request.status) && <>
            {permitTypes.includes(request.type) && <label className="firearms-compact-field">{t('Échéance du permis (à définir lors de la validation)')}<input type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={expirations[request.id] ?? ''} onChange={(event) => setExpirations((previous) => ({ ...previous, [request.id]: event.target.value }))} /></label>}
            <label className="firearms-compact-field">{t('Commentaire / informations à demander')}<textarea rows={2} value={comments[request.id] ?? ''} onChange={(event) => setComments((previous) => ({ ...previous, [request.id]: event.target.value }))} /></label>
            <div className="firearms-decision-actions">
              <button className="button" type="button" disabled={decisionMutation.isPending} onClick={() => decide(request, 'IN_REVIEW')}>{t('Prendre en charge')}</button>
              <button className="button" type="button" disabled={decisionMutation.isPending} onClick={() => decide(request, 'NEEDS_INFO')}>{t('Demander un complément')}</button>
              <button className="button primary" type="button" disabled={decisionMutation.isPending} onClick={() => decide(request, 'APPROVED')}>{t('Valider')}</button>
              <button className="button danger" type="button" disabled={decisionMutation.isPending} onClick={() => decide(request, 'REJECTED')}>{t('Rejeter')}</button>
            </div>
          </>}
        </article>)}
      </div><Pagination page={Math.min(requestPage, totalRequestPages)} totalPages={totalRequestPages} onChange={setRequestPage} /></>}
    </section>

    <section className="firearms-panel">
      <div className="firearms-section-heading"><div><p className="eyebrow">{t('Rapports')}</p><h2>{t('Statistiques par type d’arme')}</h2></div></div>
      <div className="firearms-overview"><article><span>{t('Solde estimé des contrôles')}</span><strong>{stats ? `${Number(stats.firearmBalance ?? 0).toLocaleString('fr-FR')} Ar` : '…'}</strong></article></div>
      {stats?.firearmsByType.length ? <div className="firearms-type-stats">{stats.firearmsByType.map((item) => <article key={item.weaponType}><span>{item.weaponType}</span><strong>{item.count}</strong></article>)}</div> : <p className="firearms-empty">{t('Aucune arme active recensée.')}</p>}
    </section>
  </section>;
}
