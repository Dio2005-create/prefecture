import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../services/api';
import { Empty, Loading, Pagination } from '../components/ui';
import type { CitizenRequest } from '../types';
import { usePreferences } from '../preferences';

const filters = [{ value: undefined, label: 'Tous les dossiers' }, { value: 'SUBMITTED', label: 'À traiter' }, { value: 'APPROVED', label: 'Livrés' }, { value: 'REJECTED', label: 'Rejetés' }];
const statusLabels: Record<string, string> = { SUBMITTED: 'Reçu', IN_REVIEW: 'En instruction', IN_PROGRESS: 'En instruction', NEEDS_INFO: 'Complément demandé', APPROVED: 'Validé', REJECTED: 'Rejeté' };

export function AdminDashboardPage() {
  const { t } = usePreferences();
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const { data: stats, isLoading } = useQuery({ queryKey: ['admin-stats'], queryFn: adminService.getStats });
  const values = stats ?? { total: 0, pending: 0, approved: 0, rejected: 0 };
  const { data: requests = [], isLoading: requestsLoading } = useQuery({ queryKey: ['admin-dashboard-requests', filter], queryFn: () => adminService.listRequests(filter) });
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(requests.length / pageSize));
  const visibleRequests = requests.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <div className="panel" style={{ padding: 20 }}>
          <p className="eyebrow">{t('Demandes')}</p>
          <h2 style={{ margin: '0.6rem 0 0', fontSize: '2rem' }}>{isLoading ? '...' : values.total}</h2>
          <small>{t('tous les dossiers')}</small>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <p className="eyebrow">{t('Urgents')}</p>
          <h2 style={{ margin: '0.6rem 0 0', fontSize: '2rem' }}>{isLoading ? '...' : values.pending}</h2>
          <small>{t('à instruire')}</small>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <p className="eyebrow">{t('Validés')}</p>
          <h2 style={{ margin: '0.6rem 0 0', fontSize: '2rem' }}>{isLoading ? '...' : values.approved}</h2>
          <small>{t('validés')}</small>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <p className="eyebrow">{t('Délais')}</p>
          <h2 style={{ margin: '0.6rem 0 0', fontSize: '2rem' }}>{isLoading ? '...' : values.rejected}</h2>
          <small>{t('rejetés')}</small>
        </div>
      </section>

      <div className="panel" style={{ padding: 20 }}>
        <h3 style={{ marginTop: 0 }}>{t('Vue d’activité de la préfecture')}</h3>
        <p>{t('Cette vue est réservée à l’administration. Elle affiche les dossiers en attente, les urgences, les dossiers à valider et les indicateurs de performance.')}</p>
      </div>
      <div className="panel" style={{ padding: 20 }}>
        <div className="admin-filter-heading"><div><h3 style={{ margin: 0 }}>{t('Demandes par état')}</h3><small>{t('Consultez rapidement les dossiers concernés.')}</small></div><div className="filter-tabs">{filters.map((item) => <button key={item.label} className={filter === item.value ? 'active' : ''} onClick={() => { setFilter(item.value); setPage(1); }}>{t(item.label)}</button>)}</div></div>
        {requestsLoading ? <Loading /> : visibleRequests.length === 0 ? <Empty text="Aucune demande dans cet état." /> : <div className="admin-request-list">{visibleRequests.map((request: CitizenRequest) => <div className="recent-row" key={request.id}><span><strong>{request.title ?? t(request.type)}</strong><small>{request.user?.nom ?? request.user?.email} · {request.service?.nameFr}</small></span><span className={`status ${request.status === 'APPROVED' ? 'valide' : request.status === 'REJECTED' ? 'erreur' : 'en_traitement'}`}>{t(statusLabels[request.status] ?? request.status.replace(/_/g, ' ').toLowerCase())}</span>{request.status === 'APPROVED' || request.status === 'REJECTED' ? <button className="button danger small" onClick={() => void adminService.hideRequest(request.id)}>{t('Supprimer de la vue')}</button> : null}</div>)}</div>}
        <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
