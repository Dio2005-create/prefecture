import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminService } from '../services/api';
import { Empty, Loading, Pagination } from '../components/ui';
import type { CitizenRequest } from '../types';
import { usePreferences } from '../preferences';
import { Activity, FileCheck2, FileClock, UserRound, Users } from 'lucide-react';

const filters = [{ value: undefined, label: 'Tous les dossiers' }, { value: 'SUBMITTED', label: 'À traiter' }, { value: 'APPROVED', label: 'Livrés' }, { value: 'REJECTED', label: 'Rejetés' }];
const statusLabels: Record<string, string> = { SUBMITTED: 'Reçu', IN_REVIEW: 'En instruction', IN_PROGRESS: 'En instruction', NEEDS_INFO: 'Complément demandé', APPROVED: 'Validé', REJECTED: 'Rejeté' };

export function AdminDashboardPage() {
  const { t, language } = usePreferences();
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const { data: stats, isLoading } = useQuery({ queryKey: ['admin-stats'], queryFn: adminService.getStats });
  const values = {
    total: 0, pending: 0, approved: 0, rejected: 0, totalUsers: 0,
    citizens: 0, administrators: 0, activeUsers: 0, ...stats,
    monthlySeries: stats?.monthlySeries ?? [],
  };
  const { data: requests = [], isLoading: requestsLoading } = useQuery({ queryKey: ['admin-dashboard-requests', filter], queryFn: () => adminService.listRequests(filter) });
  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(requests.length / pageSize));
  const visibleRequests = requests.slice((page - 1) * pageSize, page * pageSize);
  const maxMonthlyValue = Math.max(1, ...values.monthlySeries.flatMap((item) => [item.requests, item.users]));
  const monthLabel = (month: string) => new Intl.DateTimeFormat(language === 'mg' ? 'mg-MG' : 'fr-FR', { month: 'short' })
    .format(new Date(`${month}-01T00:00:00Z`));
  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <section className="admin-stat-grid">
        {[
          { label: 'Demandes', value: values.total, note: 'tous les dossiers', icon: FileCheck2 },
          { label: 'En attente', value: values.pending, note: 'à instruire', icon: FileClock },
          { label: 'Validés', value: values.approved, note: 'validés', icon: FileCheck2 },
          { label: 'Rejetés', value: values.rejected, note: 'rejetés', icon: Activity },
          { label: 'Utilisateurs', value: values.totalUsers, note: 'tous les comptes', icon: Users },
          { label: 'Citoyens', value: values.citizens, note: 'comptes citoyens', icon: UserRound },
          { label: 'Administrateurs', value: values.administrators, note: 'comptes administrateurs', icon: UserRound },
          { label: 'Comptes actifs', value: values.activeUsers, note: 'utilisateurs actifs', icon: Activity },
        ].map(({ label, value, note, icon: Icon }) => (
          <article className="panel admin-stat-card" key={label}>
            <div className="admin-stat-heading"><span>{t(label)}</span><Icon size={17} /></div>
            <strong className="admin-stat-value">{isLoading ? '...' : value}</strong>
            <small>{t(note)}</small>
          </article>
        ))}
      </section>

      <section className="panel admin-monthly-panel">
        <div className="admin-monthly-heading"><div><p className="eyebrow">{t('Indicateurs')}</p><h2>{t('Évolution des demandes et des utilisateurs')}</h2><small>{t('Inscriptions et demandes créées sur les six derniers mois.')}</small></div></div>
        {isLoading ? <Loading /> : <div className="admin-monthly-chart" role="img" aria-label={t('Graphique mensuel des demandes et inscriptions utilisateurs')}>
          {values.monthlySeries.map((item) => <div className="admin-month-column" key={item.month}>
            <div className="admin-month-bars">
              <div className="admin-month-bar requests" style={{ height: `${item.requests ? Math.max(5, item.requests / maxMonthlyValue * 100) : 0}%` }} title={`${t('Demandes')}: ${item.requests}`}><span>{item.requests || ''}</span></div>
              <div className="admin-month-bar users" style={{ height: `${item.users ? Math.max(5, item.users / maxMonthlyValue * 100) : 0}%` }} title={`${t('Utilisateurs')}: ${item.users}`}><span>{item.users || ''}</span></div>
            </div>
            <small>{monthLabel(item.month)}</small>
          </div>)}
        </div>}
        <div className="admin-chart-legend"><span><i className="requests" />{t('Demandes')}</span><span><i className="users" />{t('Utilisateurs')}</span></div>
      </section>
      <div className="panel" style={{ padding: 20 }}>
        <div className="admin-filter-heading"><div><h3 style={{ margin: 0 }}>{t('Demandes par état')}</h3><small>{t('Consultez rapidement les dossiers concernés.')}</small></div><div className="filter-tabs">{filters.map((item) => <button key={item.label} className={filter === item.value ? 'active' : ''} onClick={() => { setFilter(item.value); setPage(1); }}>{t(item.label)}</button>)}</div></div>
        {requestsLoading ? <Loading /> : visibleRequests.length === 0 ? <Empty text="Aucune demande dans cet état." /> : <div className="admin-request-list">{visibleRequests.map((request: CitizenRequest) => <div className="recent-row" key={request.id}><span><strong>{request.title ?? t(request.type)}</strong><small>{request.user?.nom ?? request.user?.email} · {request.service?.nameFr}</small></span><span className={`status ${request.status === 'APPROVED' ? 'valide' : request.status === 'REJECTED' ? 'erreur' : 'en_traitement'}`}>{t(statusLabels[request.status] ?? request.status.replace(/_/g, ' ').toLowerCase())}</span>{request.status === 'APPROVED' || request.status === 'REJECTED' ? <button className="button danger small" onClick={() => void adminService.hideRequest(request.id)}>{t('Supprimer de la vue')}</button> : null}</div>)}</div>}
        <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} onChange={setPage} />
      </div>
    </div>
  );
}
