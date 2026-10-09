import { useState } from 'react';
import axios from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, FileText, AlertCircle, Download, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { adminService, appointmentService } from '../services/api';
import { Loading, Empty, Pagination } from '../components/ui';
import type { CitizenRequest } from '../types';
import { usePreferences } from '../preferences';

const statusLabels: Record<string, string> = {
  DRAFT: 'Brouillon', SUBMITTED: 'Reçu', IN_REVIEW: 'En instruction', IN_PROGRESS: 'En instruction',
  NEEDS_INFO: 'Complément demandé', APPROVED: 'Validé', REJECTED: 'Rejeté', ARCHIVED: 'Archivé',
  PENDING_CHIEF: 'En attente de validation', PENDING_PREFECT: 'En attente de validation',
};

function formatStatus(status: string) {
  return statusLabels[status] ?? status.replace(/_/g, ' ').toLowerCase();
}

function formatFieldName(name: string) {
  return name.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`).replace(/^./, (letter) => letter.toUpperCase());
}

function formatFieldValue(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  return value ? JSON.stringify(value) : '—';
}

const terminalStatuses = new Set(['APPROVED', 'REJECTED', 'ARCHIVED', 'CANCELLED']);

interface RequestCard {
  request: CitizenRequest;
  onApprove: (id: string, notes?: string, slotId?: string) => void;
  onReject: (id: string, reason: string) => void;
  onRequestInfo: (id: string, info: string) => void;
  onEdit: (id: string, data: string) => void;
  isLoading: boolean;
  approveLabel: string;
  appointmentSlots: Array<{ id: string; startsAt: string; endsAt: string; office: string }>;
}

function RequestCard({ request, onApprove, onReject, onRequestInfo, onEdit, isLoading, approveLabel, appointmentSlots }: RequestCard) {
  const { t, language } = usePreferences();
  const [action, setAction] = useState<'approve' | 'reject' | 'info' | 'edit' | null>(null);
  const [input, setInput] = useState(action === 'edit' ? JSON.stringify(request.formData ?? {}, null, 2) : '');
  const [selectedAppointmentSlot, setSelectedAppointmentSlot] = useState('');
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const isCinRequest = ['CIN_REQUEST', 'CIN_RENEWAL'].includes(request.type);
  const hasScheduledCinAppointment = isCinRequest && Boolean(request.appointments?.some((appointment) => ['PENDING', 'BOOKED'].includes(appointment.status)));

  const handleAction = () => {
    if (action === 'approve') {
      onApprove(request.id, input.trim(), isCinRequest && request.status === 'IN_REVIEW' ? selectedAppointmentSlot : undefined);
    } else if (action === 'reject') {
      onReject(request.id, input.trim());
    } else if (action === 'info') {
      onRequestInfo(request.id, input.trim());
    } else if (action === 'edit') {
      onEdit(request.id, input);
    }
    setAction(null);
    setInput('');
  };

  return (
    <div className="panel request-card" style={{ padding: 20, marginBottom: 12, borderLeft: '4px solid var(--color-blue)' }}>
      <div className="request-card-header">
        <div>
          <p className="eyebrow">{language === 'mg' ? request.service?.nameMg || t('Service inconnu') : request.service?.nameFr || t('Service inconnu')}</p>
          <h3 style={{ margin: '0.4rem 0', fontSize: '1.1rem' }}>{request.title || t('Demande sans titre')}</h3>
          <small className="request-citizen-meta">
            {t('Citoyen')} : {request.user?.nom || request.user?.email || t('Inconnu')} • {request.user?.email}
          </small>
          {request.description && <p className="request-card-description">{request.description}</p>}
          {request.formData && Object.keys(request.formData).length > 0 && (
            <div className="request-card-details" style={{ marginTop: 12, padding: 12, borderRadius: 6 }}>
              <strong style={{ fontSize: '0.85rem' }}>{t('Informations déclarées')}</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6, marginTop: 8 }}>
                {Object.entries(request.formData).map(([key, value]) => (
                  <small className="request-card-field" key={key}><strong>{t(formFieldLabels[key] ?? formatFieldName(key))} :</strong> {formatFieldValue(value)}</small>
                ))}
              </div>
            </div>
          )}
          {request.attachments && request.attachments.length > 0 && (
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              <button className="attachment-toggle" type="button" onClick={() => setAttachmentsOpen((open) => !open)} aria-expanded={attachmentsOpen}>
                <span><FileText size={14} /> {t('Pièces jointes ({{count}})', { count: request.attachments.length })}</span>
                {attachmentsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {attachmentsOpen && <div className="attachment-list">{request.attachments.map((attachment) => <button className="button muted" key={attachment.id} onClick={() => void adminService.downloadAttachment(request.id, attachment.id).then((blob) => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = attachment.originalName; link.click(); URL.revokeObjectURL(url); })}><Download size={14} />{attachment.label ?? attachment.originalName}</button>)}</div>}
            </div>
          )}
        </div>
        <div className="request-card-footer">
          <span className="request-card-status">{t(hasScheduledCinAppointment ? 'En attente du rendez-vous d’empreintes' : formatStatus(request.status))}</span>
          {hasScheduledCinAppointment && <small className="muted">{t('Rendez-vous attribué')}: {new Date(request.appointments?.find((appointment) => ['PENDING', 'BOOKED'].includes(appointment.status))?.startsAt ?? '').toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR', { timeZone: 'Indian/Antananarivo' })}</small>}
          {terminalStatuses.has(request.status) || hasScheduledCinAppointment ? <small className="muted">{t(hasScheduledCinAppointment ? 'En attente de la prise des empreintes pour valider la demande.' : 'Actions indisponibles : dossier déjà traité.')}</small> : <div className="request-card-actions">
          <button
            className="button small"
            onClick={() => setAction('approve')}
            disabled={isLoading}
            style={{ backgroundColor: '#2f7d5b', color: '#fff' }}
          >
            <Check size={14} /> {approveLabel}
          </button>
          <button
            className="button small"
            onClick={() => setAction('reject')}
            disabled={isLoading}
            style={{ backgroundColor: '#b44d4d', color: '#fff' }}
          >
            <X size={14} /> {t('Rejeter')}
          </button>
          <button
            className="button small"
            onClick={() => setAction('info')}
            disabled={isLoading}
            style={{ backgroundColor: '#b77b32', color: '#fff' }}
          >
            <AlertCircle size={14} /> {t('Info')}
          </button>
          <button className="button small" onClick={() => { setAction('edit'); setInput(JSON.stringify(request.formData ?? {}, null, 2)); }} disabled={isLoading}>
            <Pencil size={14} /> {t('Corriger')}
          </button>
          </div>}
        </div>
      </div>

      {action && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
          {action === 'approve' && (
            <div>
              {isCinRequest && request.status === 'IN_REVIEW' ? <>
                <label className="request-field">{t('Créneau pour les empreintes')} *
                  <select value={selectedAppointmentSlot} onChange={(event) => setSelectedAppointmentSlot(event.target.value)}>
                    <option value="">{appointmentSlots.length ? t('Sélectionner un créneau') : t('Aucun créneau futur disponible')}</option>
                    {appointmentSlots.map((slot) => <option key={slot.id} value={slot.id}>
                      {new Date(slot.startsAt).toLocaleString(language === 'mg' ? 'mg-MG' : 'fr-FR', { timeZone: 'Indian/Antananarivo' })} – {new Date(slot.endsAt).toLocaleTimeString(language === 'mg' ? 'mg-MG' : 'fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Indian/Antananarivo' })} · {slot.office}
                    </option>)}
                  </select>
                </label>
                <p>{t('La demande restera en attente jusqu’à la fin du rendez-vous. La CIN sera ensuite disponible au guichet.')}</p>
              </> : <>
                <label style={{ display: 'block', marginBottom: 8 }}>
                  <small style={{ fontWeight: 500 }}>{t("Notes d'approbation (optionnel)")}</small>
                </label>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={t('Notes...')}
                  style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                  rows={2}
                />
              </>}
              <div className="request-action-footer">
                <button className="button request-cancel-button" onClick={() => setAction(null)}>
                  {t('Annuler')}
                </button>
                <button className="button primary request-confirm-button" onClick={handleAction} disabled={isLoading || (isCinRequest && request.status === 'IN_REVIEW' && !selectedAppointmentSlot)}>
                  {t(isCinRequest && request.status === 'IN_REVIEW' ? 'Attribuer le rendez-vous' : 'Confirmer approbation')}
                </button>
              </div>
            </div>
          )}

          {action === 'reject' && (
            <div>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <small style={{ fontWeight: 500 }}>{t('Raison du rejet')} *</small>
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('Expliquez pourquoi cette demande est rejetée...')}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                rows={3}
              />
              <div className="request-action-footer">
                <button className="button request-cancel-button" onClick={() => setAction(null)}>
                  {t('Annuler')}
                </button>
                <button className="button request-reject-button" onClick={handleAction} disabled={isLoading || !input.trim()}>
                  {t('Confirmer rejet')}
                </button>
              </div>
            </div>
          )}

          {action === 'info' && (
            <div>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <small style={{ fontWeight: 500 }}>{t('Information demandée au citoyen')} *</small>
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("Décrivez l'information à fournir...")}
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                rows={3}
              />
              <div className="request-action-footer">
                <button className="button request-cancel-button" onClick={() => setAction(null)}>
                  {t('Annuler')}
                </button>
                <button className="button primary request-confirm-button" onClick={handleAction} disabled={isLoading || !input.trim()}>
                  {t("Demander l'info")}
                </button>
              </div>
            </div>
          )}

          {action === 'edit' && (
            <div>
              <label style={{ display: 'block', marginBottom: 8 }}><small style={{ fontWeight: 500 }}>{t('Informations du formulaire (JSON)')} *</small></label>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={8} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', fontFamily: 'monospace' }} />
              <div className="request-action-footer"><button className="button request-cancel-button" onClick={() => setAction(null)}>{t('Annuler')}</button><button className="button primary request-confirm-button" onClick={handleAction} disabled={isLoading || !input.trim()}>{t('Enregistrer')}</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const formFieldLabels: Record<string, string> = {
  materielsPerdus: 'Matériel perdu',
  datePerte: 'Date approximative de la perte',
  lieuCirconstances: 'Lieu / circonstances',
};

export function AdminWorkflowPage() {
  const { t } = usePreferences();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [workflowError, setWorkflowError] = useState('');
  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ['admin-requests'],
    queryFn: () => adminService.listRequests(),
  });
  const { data: appointmentSlots = [] } = useQuery({
    queryKey: ['admin-appointment-slots'],
    queryFn: appointmentService.listSlotsForAdmin,
  });
  const freeFutureSlots = appointmentSlots
    .filter((slot: { isActive: boolean; startsAt: string; appointments: Array<{ id: string }> }) => slot.isActive && new Date(slot.startsAt) > new Date() && slot.appointments.length === 0);

  const [actionLoading, setActionLoading] = useState(false);
  const getApproveLabel = (status: string, type: string) => {
    if (status !== 'IN_REVIEW') return t('Prendre en instruction');
    return t(['CIN_REQUEST', 'CIN_RENEWAL'].includes(type)
      ? 'Valider le dossier — rendez-vous empreintes au guichet'
      : 'Valider et délivrer');
  };
  const visibleRequests = (requests ?? []).slice((page - 1) * 5, page * 5);
  const refreshRequestData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['citizen-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['citizen-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-appointment-slots'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
    ]);
  };

  const handleApprove = async (id: string, notes?: string, slotId?: string) => {
    setActionLoading(true);
    setWorkflowError('');
    try {
      const request = requests?.find((item) => item.id === id);
      if (request?.status === 'IN_REVIEW' && ['CIN_REQUEST', 'CIN_RENEWAL'].includes(request.type)) {
        if (!slotId) throw new Error('Un créneau d’empreintes doit être sélectionné');
        await adminService.assignCinAppointment(id, slotId);
      } else if (request?.status === 'IN_REVIEW') await adminService.approveRequest(id, notes);
      else await adminService.submitForReview(id, notes || 'Dossier pris en charge par l’administration');
      await refreshRequestData();
    } catch (error) {
      console.error('Erreur lors de l\'approbation:', error);
      setWorkflowError(axios.isAxiosError(error)
        ? (error.response?.data as { message?: string } | undefined)?.message ?? t('La validation du dossier a échoué.')
        : error instanceof Error ? error.message : t('La validation du dossier a échoué.'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    if (!reason.trim()) return;
    setActionLoading(true);
    try {
      await adminService.rejectRequest(id, reason.trim());
      await refreshRequestData();
    } catch (error) {
      console.error('Erreur lors du rejet:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestInfo = async (id: string, info: string) => {
    if (!info.trim()) return;
    setActionLoading(true);
    try {
      await adminService.requestMoreInfo(id, info.trim());
      await refreshRequestData();
    } catch (error) {
      console.error('Erreur lors de la demande d\'info:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async (id: string, data: string) => {
    try {
      const formData = JSON.parse(data) as Record<string, unknown>;
      setActionLoading(true);
      await adminService.updateRequest(id, { formData });
      await refreshRequestData();
    } catch (error) {
      console.error('Erreur lors de la correction:', error);
    } finally {
      setActionLoading(false);
    }
  };

  if (requestsLoading) return <Loading />;

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <div className="panel" style={{ padding: 20 }}>
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t('Demandes en traitement')}</h3>
          <small style={{ color: 'var(--color-muted)' }}>{t('Approuver, rejeter ou demander des informations complémentaires')}</small>
        </div>

        {workflowError && <p className="error-message" role="alert">{t(workflowError)}</p>}
        {requestsLoading ? (
          <Loading />
        ) : requests && requests.length > 0 ? (
          <div>
            {visibleRequests.map((request) => (
              <RequestCard
                key={request.id}
                request={request}
                onApprove={handleApprove}
                onReject={handleReject}
                onRequestInfo={handleRequestInfo}
                onEdit={handleEdit}
                isLoading={actionLoading}
                approveLabel={getApproveLabel(request.status, request.type)}
                appointmentSlots={freeFutureSlots}
              />
            ))}
            <Pagination page={page} totalPages={Math.max(1, Math.ceil(requests.length / 5))} onChange={setPage} />
          </div>
        ) : (
          <Empty text="Aucune demande en attente." />
        )}
      </div>
    </div>
  );
}
