import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X, FileText, AlertCircle, Download, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { adminService } from '../services/api';
import { Loading, Empty, Pagination } from '../components/ui';
import type { CitizenRequest } from '../types';

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
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
  onRequestInfo: (id: string, info: string) => void;
  onEdit: (id: string, data: string) => void;
  isLoading: boolean;
  approveLabel: string;
}

function RequestCard({ request, onApprove, onReject, onRequestInfo, onEdit, isLoading, approveLabel }: RequestCard) {
  const [action, setAction] = useState<'approve' | 'reject' | 'info' | 'edit' | null>(null);
  const [input, setInput] = useState(action === 'edit' ? JSON.stringify(request.formData ?? {}, null, 2) : '');
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);

  const handleAction = () => {
    if (action === 'approve') {
      onApprove(request.id);
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
    <div className="panel" style={{ padding: 20, marginBottom: 12, borderLeft: '4px solid var(--color-blue)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 16, alignItems: 'start' }}>
        <div>
          <p className="eyebrow">{request.service?.nameFr || 'Service inconnu'}</p>
          <h3 style={{ margin: '0.4rem 0', fontSize: '1.1rem' }}>{request.title || 'Demande sans titre'}</h3>
          <small style={{ color: 'var(--color-muted)' }}>
            Citoyen: {request.user?.nom || request.user?.email || 'Inconnu'} • {request.user?.email}
          </small>
          {request.description && <p style={{ marginTop: 8, fontSize: '0.9rem', color: 'var(--color-muted)' }}>{request.description}</p>}
          {request.formData && Object.keys(request.formData).length > 0 && (
            <div style={{ marginTop: 12, padding: 12, background: 'var(--color-blue-light)', borderRadius: 6 }}>
              <strong style={{ fontSize: '0.85rem' }}>Informations déclarées</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6, marginTop: 8 }}>
                {Object.entries(request.formData).map(([key, value]) => (
                  <small key={key}><strong>{formatFieldName(key)} :</strong> {formatFieldValue(value)}</small>
                ))}
              </div>
            </div>
          )}
          {request.attachments && request.attachments.length > 0 && (
            <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
              <button className="attachment-toggle" type="button" onClick={() => setAttachmentsOpen((open) => !open)} aria-expanded={attachmentsOpen}>
                <span><FileText size={14} /> Pièces jointes ({request.attachments.length})</span>
                {attachmentsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
              {attachmentsOpen && <div className="attachment-list">{request.attachments.map((attachment) => <button className="button muted" key={attachment.id} onClick={() => void adminService.downloadAttachment(request.id, attachment.id).then((blob) => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = attachment.originalName; link.click(); URL.revokeObjectURL(url); })}><Download size={14} />{attachment.label ?? attachment.originalName}</button>)}</div>}
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <span style={{ display: 'inline-block', padding: '2px 8px', backgroundColor: 'var(--color-blue-light)', color: 'var(--color-blue)', borderRadius: 4, fontSize: '0.8rem' }}>
              {formatStatus(request.status)}
            </span>
          </div>
        </div>
        {terminalStatuses.has(request.status) ? <small className="muted">Actions indisponibles : dossier déjà traité.</small> : <div className="request-card-actions">
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
            <X size={14} /> Rejeter
          </button>
          <button
            className="button small"
            onClick={() => setAction('info')}
            disabled={isLoading}
            style={{ backgroundColor: '#b77b32', color: '#fff' }}
          >
            <AlertCircle size={14} /> Info
          </button>
          <button className="button small" onClick={() => { setAction('edit'); setInput(JSON.stringify(request.formData ?? {}, null, 2)); }} disabled={isLoading}>
            <Pencil size={14} /> Corriger
          </button>
        </div>}
      </div>

      {action && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
          {action === 'approve' && (
            <div>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <small style={{ fontWeight: 500 }}>Notes d'approbation (optionnel)</small>
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Notes..."
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                rows={2}
              />
              <div className="request-action-footer">
                <button className="button request-cancel-button" onClick={() => setAction(null)}>
                  Annuler
                </button>
                <button className="button primary request-confirm-button" onClick={handleAction} disabled={isLoading}>
                  Confirmer approbation
                </button>
              </div>
            </div>
          )}

          {action === 'reject' && (
            <div>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <small style={{ fontWeight: 500 }}>Raison du rejet *</small>
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Expliquez pourquoi cette demande est rejetée..."
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                rows={3}
              />
              <div className="request-action-footer">
                <button className="button request-cancel-button" onClick={() => setAction(null)}>
                  Annuler
                </button>
                <button className="button request-reject-button" onClick={handleAction} disabled={isLoading || !input.trim()}>
                  Confirmer rejet
                </button>
              </div>
            </div>
          )}

          {action === 'info' && (
            <div>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <small style={{ fontWeight: 500 }}>Information demandée au citoyen *</small>
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Décrivez l'information à fournir..."
                style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', fontSize: '0.9rem' }}
                rows={3}
              />
              <div className="request-action-footer">
                <button className="button request-cancel-button" onClick={() => setAction(null)}>
                  Annuler
                </button>
                <button className="button primary request-confirm-button" onClick={handleAction} disabled={isLoading || !input.trim()}>
                  Demander l'info
                </button>
              </div>
            </div>
          )}

          {action === 'edit' && (
            <div>
              <label style={{ display: 'block', marginBottom: 8 }}><small style={{ fontWeight: 500 }}>Informations du formulaire (JSON) *</small></label>
              <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={8} style={{ width: '100%', padding: 8, borderRadius: 4, border: '1px solid var(--color-border)', fontFamily: 'monospace' }} />
              <div className="request-action-footer"><button className="button request-cancel-button" onClick={() => setAction(null)}>Annuler</button><button className="button primary request-confirm-button" onClick={handleAction} disabled={isLoading || !input.trim()}>Enregistrer</button></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AdminWorkflowPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => adminService.getStats(),
  });

  const { data: requests, isLoading: requestsLoading } = useQuery({
    queryKey: ['admin-requests'],
    queryFn: () => adminService.listRequests(),
  });

  const [actionLoading, setActionLoading] = useState(false);
  const getApproveLabel = (status: string) => status === 'IN_REVIEW' ? 'Valider et délivrer' : 'Prendre en instruction';
  const visibleRequests = (requests ?? []).slice((page - 1) * 5, page * 5);
  const refreshRequestData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] }),
      queryClient.invalidateQueries({ queryKey: ['citizen-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['citizen-stats'] }),
    ]);
  };

  const handleApprove = async (id: string) => {
    setActionLoading(true);
    try {
      const request = requests?.find((item) => item.id === id);
      if (request?.status === 'IN_REVIEW') await adminService.approveRequest(id);
      else await adminService.submitForReview(id, 'Dossier pris en charge par l’administration');
      await refreshRequestData();
    } catch (error) {
      console.error('Erreur lors de l\'approbation:', error);
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

  if (statsLoading || requestsLoading) return <Loading />;

  return (
    <div style={{ display: 'grid', gap: '2rem' }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
        <div className="panel" style={{ padding: 20 }}>
          <p className="eyebrow">Total</p>
          <h2 style={{ margin: '0.6rem 0 0', fontSize: '2rem' }}>{stats?.total ?? 0}</h2>
          <small>Demandes</small>
        </div>
        <div className="panel" style={{ padding: 20, borderLeft: '4px solid var(--color-orange)' }}>
          <p className="eyebrow">En attente</p>
          <h2 style={{ margin: '0.6rem 0 0', fontSize: '2rem' }}>{stats?.pending ?? 0}</h2>
          <small>À traiter</small>
        </div>
        <div className="panel" style={{ padding: 20, borderLeft: '4px solid var(--color-green)' }}>
          <p className="eyebrow">Approuvées</p>
          <h2 style={{ margin: '0.6rem 0 0', fontSize: '2rem' }}>{stats?.approved ?? 0}</h2>
          <small>Traitées</small>
        </div>
        <div className="panel" style={{ padding: 20, borderLeft: '4px solid var(--color-red)' }}>
          <p className="eyebrow">Rejetées</p>
          <h2 style={{ margin: '0.6rem 0 0', fontSize: '2rem' }}>{stats?.rejected ?? 0}</h2>
          <small>Non valides</small>
        </div>
      </section>

      <div className="panel" style={{ padding: 20 }}>
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Demandes en traitement</h3>
          <small style={{ color: 'var(--color-muted)' }}>Approuver, rejeter ou demander des informations complémentaires</small>
        </div>

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
                approveLabel={getApproveLabel(request.status)}
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
