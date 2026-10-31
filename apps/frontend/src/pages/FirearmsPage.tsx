import { useMemo, useState, type FormEvent } from 'react';
import axios from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { firearmsService } from '../services/api';
import { Pagination } from '../components/ui';
import type { FirearmRequestType } from '../types';
import { usePreferences } from '../preferences';

const requestLabels: Record<FirearmRequestType, string> = {
  HOLDING_PERMIT: 'Demande de permis de détention',
  CARRY_PERMIT: 'Demande de permis de port',
  REGISTER_FIREARM: 'Enregistrement d’une arme',
  RENEW_PERMIT: 'Renouvellement de permis',
  DEREGISTER_FIREARM: 'Radiation d’une arme',
  TRANSFER_FIREARM: 'Cession / transfert d’une arme',
};
const statusLabels: Record<string, string> = {
  PENDING: 'En attente',
  IN_REVIEW: 'En instruction',
  NEEDS_INFO: 'Complément demandé',
  APPROVED: 'Validée',
  REJECTED: 'Rejetée',
  CANCELLED: 'Annulée',
  ACTIVE: 'Actif',
  EXPIRED: 'Expiré',
  REVOKED: 'Révoqué',
  REPLACED: 'Remplacé',
};
const PAGE_SIZE = 5;

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = (error.response?.data as { message?: string | string[] } | undefined)?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (message) return message;
  }
  return error instanceof Error ? error.message : 'La demande n’a pas pu être envoyée.';
}

function downloadFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function FirearmsPage() {
  const { t } = usePreferences();
  const queryClient = useQueryClient();
  const [type, setType] = useState<FirearmRequestType>('REGISTER_FIREARM');
  const [data, setData] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [firearmPage, setFirearmPage] = useState(1);
  const [requestPage, setRequestPage] = useState(1);
  const { data: firearms = [], isLoading: loadingFirearms, isError: firearmsError } = useQuery({
    queryKey: ['firearms-mine'],
    queryFn: firearmsService.listMine,
  });
  const { data: permits = [] } = useQuery({
    queryKey: ['firearms-my-permits'],
    queryFn: firearmsService.listMyPermits,
  });
  const { data: requests = [], isLoading: loadingRequests, isError: requestsError, refetch, isFetching } = useQuery({
    queryKey: ['firearms-my-requests'],
    queryFn: firearmsService.listMyRequests,
  });
  const firearmFees: Record<FirearmRequestType, number> = {
    HOLDING_PERMIT: 25000,
    CARRY_PERMIT: 35000,
    REGISTER_FIREARM: 20000,
    RENEW_PERMIT: 20000,
    DEREGISTER_FIREARM: 10000,
    TRANSFER_FIREARM: 15000,
  };
  const mutation = useMutation({
    mutationFn: () => firearmsService.createRequest({ type, data, files }),
    onSuccess: async () => {
      setData({});
      setFiles([]);
      setFormError('');
      setFormSuccess('Votre demande a été transmise à l’administration.');
      const input = document.getElementById('firearms-supporting-files') as HTMLInputElement | null;
      if (input) input.value = '';
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['firearms-mine'] }),
        queryClient.invalidateQueries({ queryKey: ['firearms-my-requests'] }),
      ]);
    },
    onError: (error: unknown) => {
      setFormSuccess('');
      setFormError(errorMessage(error));
    },
  });
  const activeFirearms = useMemo(() => firearms.filter((firearm) => firearm.isActive), [firearms]);
  const availablePermits = useMemo(() => permits.filter((permit) => permit.status === 'ACTIVE' || permit.status === 'EXPIRED'), [permits]);
  const visibleFirearms = firearms.slice((firearmPage - 1) * PAGE_SIZE, firearmPage * PAGE_SIZE);
  const visibleRequests = requests.slice((requestPage - 1) * PAGE_SIZE, requestPage * PAGE_SIZE);

  const updateField = (key: string, value: string) => setData((previous) => ({ ...previous, [key]: value }));
  const changeType = (next: FirearmRequestType) => {
    setType(next);
    setData({});
    setFormError('');
    setFormSuccess('');
  };
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    setFormSuccess('');
    if (files.length === 0) {
      setFormError('Ajoutez au moins un document justificatif.');
      return;
    }
    mutation.mutate();
  };
  const download = async (requestId: string, attachmentId: string, filename: string) => {
    try {
      downloadFile(await firearmsService.downloadAttachment(requestId, attachmentId), filename);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };
  const downloadOfficial = async (requestId: string) => {
    try {
      downloadFile(await firearmsService.downloadOfficialDocument(requestId), `document-controle-armements-${requestId}.pdf`);
    } catch (error) {
      setFormError(errorMessage(error));
    }
  };

  return <section className="firearms-page">
    <header className="firearms-heading">
      <div><p className="eyebrow">{t('Démarches spécialisées')}</p><h1>{t('Contrôle des armements')}</h1><p>{t('Gérez vos demandes de permis, vos armes enregistrées et les justificatifs de votre dossier.')}</p></div>
      <ShieldCheck size={34} aria-hidden="true" />
    </header>

    <div className="firearms-overview">
      <article><span>{t('Armes enregistrées')}</span><strong>{activeFirearms.length}</strong></article>
      <article><span>{t('Demandes en attente')}</span><strong>{requests.filter((request) => ['PENDING', 'IN_REVIEW', 'NEEDS_INFO'].includes(request.status)).length}</strong></article>
      <article><span>{t('Permis actifs')}</span><strong>{availablePermits.filter((permit) => permit.status === 'ACTIVE' && new Date(permit.expiresAt) > new Date()).length}</strong></article>
    </div>

    <section className="firearms-panel">
      <div className="firearms-section-heading"><div><p className="eyebrow">{t('Nouvelle démarche')}</p><h2>{t('Soumettre une demande')}</h2></div></div>
      <form className="firearms-form" onSubmit={onSubmit}>
        <label>{t('Type de demande')}
          <select value={type} onChange={(event) => changeType(event.target.value as FirearmRequestType)}>
            {(Object.entries(requestLabels) as Array<[FirearmRequestType, string]>).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
          </select>
        </label>

        <p className="firearms-message" style={{ marginBottom: 0 }}><strong>Frais simulés : {firearmFees[type].toLocaleString('fr-FR')} Ar</strong></p>
        {type === 'REGISTER_FIREARM' && <div className="firearms-form-grid">
          <label>{t('Type d’arme')}<input required maxLength={80} value={data.weaponType ?? ''} onChange={(event) => updateField('weaponType', event.target.value)} placeholder={t('Ex. fusil, pistolet')} /></label>
          <label>{t('Marque')}<input required maxLength={100} value={data.brand ?? ''} onChange={(event) => updateField('brand', event.target.value)} /></label>
          <label>{t('Modèle')}<input required maxLength={100} value={data.model ?? ''} onChange={(event) => updateField('model', event.target.value)} /></label>
          <label>{t('Numéro de série')}<input required maxLength={100} value={data.serialNumber ?? ''} onChange={(event) => updateField('serialNumber', event.target.value)} /></label>
          <label>{t('Calibre')}<input maxLength={80} value={data.caliber ?? ''} onChange={(event) => updateField('caliber', event.target.value)} /></label>
          <label>{t('Date d’acquisition')}<input required type="date" max={new Date().toISOString().slice(0, 10)} value={data.acquiredAt ?? ''} onChange={(event) => updateField('acquiredAt', event.target.value)} /></label>
          <label>{t('Origine de l’arme')}<input required maxLength={120} value={data.origin ?? ''} onChange={(event) => updateField('origin', event.target.value)} placeholder={t('Achat, héritage…')} /></label>
        </div>}

        {['HOLDING_PERMIT', 'CARRY_PERMIT', 'DEREGISTER_FIREARM', 'TRANSFER_FIREARM'].includes(type) && <label>
          {t(type === 'TRANSFER_FIREARM' ? 'Arme à céder' : type === 'DEREGISTER_FIREARM' ? 'Arme à radier' : 'Arme concernée')}
          <select required={type !== 'HOLDING_PERMIT'} value={data.firearmId ?? ''} onChange={(event) => updateField('firearmId', event.target.value)}>
            <option value="">{t(type === 'HOLDING_PERMIT' ? 'Aucune arme précise' : 'Sélectionnez une arme')}</option>
            {activeFirearms.map((firearm) => <option key={firearm.id} value={firearm.id}>{firearm.brand} {firearm.model} — {firearm.serialNumber}</option>)}
          </select>
          {activeFirearms.length === 0 && type !== 'HOLDING_PERMIT' && <small>{t('Aucune arme active enregistrée. Enregistrez d’abord une arme.')}</small>}
        </label>}

        {type === 'TRANSFER_FIREARM' && <label>{t('CIN du citoyen bénéficiaire')}<input required inputMode="numeric" maxLength={12} value={data.recipientCin ?? ''} onChange={(event) => updateField('recipientCin', event.target.value)} /></label>}

        {type === 'RENEW_PERMIT' && <label>{t('Permis à renouveler')}
          <select required value={data.permitId ?? ''} onChange={(event) => updateField('permitId', event.target.value)}>
            <option value="">{t('Sélectionnez un permis')}</option>
            {availablePermits.map(({ id, type: permitType, expiresAt, firearm }) => <option key={id} value={id}>{t(permitType === 'CARRY' ? 'Permis de port' : 'Permis de détention')} · {firearm ? `${firearm.brand} ${firearm.model}` : t('Général')} · {t('échéance')} {new Date(expiresAt).toLocaleDateString()}</option>)}
          </select>
        </label>}

        <label>{t('Documents justificatifs')}<input id="firearms-supporting-files" required type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /><small>{t('Facture, certificat, photo de l’arme ou autre justificatif (PDF/JPG/PNG, 10 Mo maximum par fichier).')}</small></label>
        {files.length > 0 && <p className="firearms-file-list">{files.map((file) => file.name).join(' · ')}</p>}
        {formError && <p className="firearms-message is-error" role="alert">{formError}</p>}
        {formSuccess && <p className="firearms-message is-success" role="status">{formSuccess}</p>}
        <button className="button primary" type="submit" disabled={mutation.isPending || (['CARRY_PERMIT', 'DEREGISTER_FIREARM', 'TRANSFER_FIREARM'].includes(type) && activeFirearms.length === 0) || (type === 'RENEW_PERMIT' && availablePermits.length === 0)}>
          {mutation.isPending ? t('Envoi en cours…') : t('Envoyer la demande')}
        </button>
      </form>
    </section>

    <section className="firearms-panel">
      <div className="firearms-section-heading"><div><p className="eyebrow">{t('Votre dossier')}</p><h2>{t('Mes armes')}</h2></div></div>
      {loadingFirearms ? <p>{t('Chargement…')}</p> : firearmsError ? <p className="firearms-message is-error" role="alert">{t('Impossible de charger vos armes. Réessayez.')}</p> : firearms.length === 0 ? <p className="firearms-empty">{t('Aucune arme enregistrée. Une arme apparaîtra ici après validation de sa demande.')}</p> : <><div className="firearms-list">
        {visibleFirearms.map((firearm) => <article className="firearms-item" key={firearm.id}>
          <div className="firearms-item-heading"><div><h3>{firearm.brand} {firearm.model}</h3><p>{firearm.weaponType} · {t('N° de série')} {firearm.serialNumber}</p></div><span className={`firearms-badge ${firearm.isActive ? 'is-active' : 'is-inactive'}`}>{t(firearm.isActive ? 'Enregistrée' : 'Radiée')}</span></div>
          <p>{t('Calibre')}: {firearm.caliber ?? '—'} · {t('Acquise le')} {new Date(firearm.acquiredAt).toLocaleDateString()} · {t('Origine')}: {firearm.origin}</p>
          {firearm.permits?.length ? <div className="firearms-permits">{firearm.permits.map((permit) => <span key={permit.id}>{t(permit.type === 'CARRY' ? 'Permis de port' : 'Permis de détention')}: {t(statusLabels[permit.status] ?? permit.status)} · {t('échéance')} {new Date(permit.expiresAt).toLocaleDateString()}</span>)}</div> : null}
        </article>)}
      </div><Pagination page={Math.min(firearmPage, Math.max(1, Math.ceil(firearms.length / PAGE_SIZE)))} totalPages={Math.max(1, Math.ceil(firearms.length / PAGE_SIZE))} onChange={setFirearmPage} /></>}
    </section>

    <section className="firearms-panel">
      <div className="firearms-section-heading">
        <div><p className="eyebrow">{t('Suivi')}</p><h2>{t('Mes demandes')}</h2></div>
        <button className="button" type="button" onClick={() => void refetch()} disabled={isFetching}><RefreshCw size={15} />{t('Actualiser')}</button>
      </div>
      {loadingRequests ? <p>{t('Chargement…')}</p> : requestsError ? <p className="firearms-message is-error" role="alert">{t('Impossible de charger vos demandes. Réessayez.')}</p> : requests.length === 0 ? <p className="firearms-empty">{t('Vous n’avez pas encore soumis de demande.')}</p> : <><div className="firearms-list">
        {visibleRequests.map((request) => <article className="firearms-item" key={request.id}>
          <div className="firearms-item-heading"><div><h3>{t(requestLabels[request.type])}</h3><p>{t('Soumise le')} {new Date(request.createdAt).toLocaleString()}</p></div><span className={`firearms-badge status-${request.status.toLowerCase()}`}>{t(statusLabels[request.status] ?? request.status)}</span></div>
          {request.firearm && <p>{request.firearm.brand} {request.firearm.model} · {t('N° de série')} {request.firearm.serialNumber}</p>}
          {request.decisionComment && <p className="firearms-decision-comment">{t('Commentaire de l’administration')}: {request.decisionComment}</p>}
          <div className="firearms-request-actions">
            {request.status === 'APPROVED' && <button className="button primary" type="button" onClick={() => void downloadOfficial(request.id)}><Download size={15} />{t('Télécharger le document officiel')}</button>}
            {request.attachments.map((attachment) => <button className="text-link" type="button" key={attachment.id} onClick={() => void download(request.id, attachment.id, attachment.originalName)}>{t('Télécharger')} · {attachment.label}</button>)}
          </div>
          {request.history?.length ? <details className="firearms-history"><summary>{t('Historique de traitement')}</summary><ol>{request.history.map((entry, index) => <li key={`${entry.action}-${index}`}><strong>{t(statusLabels[entry.action.replace('REQUEST_', '')] ?? entry.action.replace(/_/g, ' '))}</strong><span>{new Date(entry.createdAt).toLocaleString()}</span>{typeof entry.details.comment === 'string' && entry.details.comment && <p>{entry.details.comment}</p>}</li>)}</ol></details> : null}
        </article>)}
      </div><Pagination page={Math.min(requestPage, Math.max(1, Math.ceil(requests.length / PAGE_SIZE)))} totalPages={Math.max(1, Math.ceil(requests.length / PAGE_SIZE))} onChange={setRequestPage} /></>}
    </section>
  </section>;
}
