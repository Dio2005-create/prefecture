import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { FileText, Sparkles, ClipboardCheck, XCircle } from 'lucide-react';
import { prefectureService } from '../services/api';

const statusLabels: Record<string, string> = { DRAFT: 'Brouillon', SUBMITTED: 'Reçu', IN_REVIEW: 'En instruction', IN_PROGRESS: 'En instruction', NEEDS_INFO: 'Complément demandé', PENDING_CHIEF: 'En attente de validation', PENDING_PREFECT: 'En attente de validation', PENDING_PAYMENT: 'En instruction', APPROVED: 'Validé', REJECTED: 'Rejeté', ARCHIVED: 'Archivé' };

export function CitizenDashboardPage() {
  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ['prefecture-services'],
    queryFn: prefectureService.listServices,
  });

  const { data: requests, isLoading: loadingRequests } = useQuery({
    queryKey: ['citizen-requests'],
    queryFn: prefectureService.listRequests,
    refetchInterval: 3000,
  });

  const { data: stats } = useQuery({
    queryKey: ['citizen-stats'],
    queryFn: prefectureService.stats,
  });

  const liveServices = useMemo(() => services ?? [], [services]);
  const requestStats = requests ? {
    total: requests.length,
    inProgress: requests.filter((request) => ['SUBMITTED', 'IN_REVIEW', 'IN_PROGRESS', 'NEEDS_INFO', 'PENDING_CHIEF', 'PENDING_PREFECT', 'PENDING_PAYMENT'].includes(request.status)).length,
    approved: requests.filter((request) => request.status === 'APPROVED').length,
    rejected: requests.filter((request) => request.status === 'REJECTED').length,
  } : stats;

  return (
    <div style={{ display: 'grid', gap: '1.5rem' }}>
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileText size={20} />
            <strong>Dossiers</strong>
          </div>
          <h2 style={{ margin: '0.8rem 0 0.2rem', fontSize: '2rem' }}>{requestStats?.total ?? 0}</h2>
          <small>Total déclarations</small>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClipboardCheck size={20} />
            <strong>En cours</strong>
          </div>
          <h2 style={{ margin: '0.8rem 0 0.2rem', fontSize: '2rem' }}>{requestStats?.inProgress ?? 0}</h2>
          <small>À traiter</small>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Sparkles size={20} />
            <strong>Validés</strong>
          </div>
          <h2 style={{ margin: '0.8rem 0 0.2rem', fontSize: '2rem' }}>{requestStats?.approved ?? 0}</h2>
          <small>Documents délivrés</small>
        </div>
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <XCircle size={20} />
            <strong>Rejetés</strong>
          </div>
          <h2 style={{ margin: '0.8rem 0 0.2rem', fontSize: '2rem' }}>{requestStats?.rejected ?? 0}</h2>
          <small>Dossiers refusés</small>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem' }}>
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Services disponibles</h3>
            <NavLink to="/front/demandes" className="text-link">Voir tout</NavLink>
          </div>
          {loadingServices ? <p>Chargement…</p> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {liveServices.map((service) => (
                <div key={service.id} style={{ border: '1px solid #dfe7ef', borderRadius: 12, padding: 14, background: '#f8fbff' }}>
                  <strong>{service.nameFr}</strong>
                  <p style={{ margin: '0.35rem 0 0', color: '#4e5d6c', fontSize: 13 }}>{service.nameMg}</p>
                  <small style={{ display: 'block', marginTop: 8, color: '#2d6cdf' }}>{service.code}</small>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>Suivi rapide</h3>
            <NavLink to="/front/demandes" className="text-link">Mes demandes</NavLink>
          </div>
          {loadingRequests ? <p>Chargement…</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {(requests ?? []).slice(0, 4).map((request) => (
                <div key={request.id} style={{ border: '1px solid #dfe7ef', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <strong>{request.title ?? request.type}</strong>
                    <div style={{ fontSize: 12, color: '#54657a' }}>{request.service?.nameFr ?? request.type}</div>
                  </div>
                  <span className="status en_traitement" style={{ whiteSpace: 'nowrap' }}>{statusLabels[request.status] ?? request.status.replace(/_/g, ' ').toLowerCase()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
