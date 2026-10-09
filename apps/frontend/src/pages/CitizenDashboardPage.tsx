import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { FileText, Sparkles, ClipboardCheck, XCircle } from 'lucide-react';
import { prefectureService } from '../services/api';
import { usePreferences } from '../preferences';

const statusLabels: Record<string, string> = { DRAFT: 'Brouillon', SUBMITTED: 'Reçu', IN_REVIEW: 'En instruction', IN_PROGRESS: 'En instruction', NEEDS_INFO: 'Complément demandé', PENDING_CHIEF: 'En attente de validation', PENDING_PREFECT: 'En attente de validation', PENDING_PAYMENT: 'En instruction', APPROVED: 'Validé', REJECTED: 'Rejeté', ARCHIVED: 'Archivé' };

export function CitizenDashboardPage() {
  const { t, language } = usePreferences();
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
        <div className="panel citizen-stat-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <FileText size={20} />
            <strong>{t('Dossiers')}</strong>
          </div>
          <h2 className="citizen-stat-value" style={{ margin: '0.8rem 0 0.2rem', fontSize: '2rem' }}>{requestStats?.total ?? 0}</h2>
          <small>{t('Total déclarations')}</small>
        </div>
        <div className="panel citizen-stat-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <ClipboardCheck size={20} />
            <strong>{t('En cours')}</strong>
          </div>
          <h2 className="citizen-stat-value" style={{ margin: '0.8rem 0 0.2rem', fontSize: '2rem' }}>{requestStats?.inProgress ?? 0}</h2>
          <small>{t('À traiter')}</small>
        </div>
        <div className="panel citizen-stat-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Sparkles size={20} />
            <strong>{t('Validés')}</strong>
          </div>
          <h2 className="citizen-stat-value" style={{ margin: '0.8rem 0 0.2rem', fontSize: '2rem' }}>{requestStats?.approved ?? 0}</h2>
          <small>{t('Documents délivrés')}</small>
        </div>
        <div className="panel citizen-stat-card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <XCircle size={20} />
            <strong>{t('Rejetés')}</strong>
          </div>
          <h2 className="citizen-stat-value" style={{ margin: '0.8rem 0 0.2rem', fontSize: '2rem' }}>{requestStats?.rejected ?? 0}</h2>
          <small>{t('Dossiers refusés')}</small>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1rem' }}>
        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{t('Services disponibles')}</h3>
            <NavLink to="/front/demandes" className="text-link">{t('Voir tout')}</NavLink>
          </div>
          {loadingServices ? <p>{t('Chargement…')}</p> : (
            <div className="citizen-service-grid">
              {liveServices.map((service) => (
                <div className="citizen-service-card" key={service.id}>
                  <strong>{language === 'mg' ? service.nameMg : service.nameFr}</strong>
                  <small>{service.code}</small>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>{t('Suivi rapide')}</h3>
            <NavLink to="/front/demandes" className="text-link">{t('Mes demandes')}</NavLink>
          </div>
          {loadingRequests ? <p>{t('Chargement…')}</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {(requests ?? []).slice(0, 4).map((request) => (
                <div key={request.id} style={{ border: '1px solid #dfe7ef', borderRadius: 12, padding: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <strong>{request.title ?? request.type}</strong>
                    <div style={{ fontSize: 12, color: '#54657a' }}>{language === 'mg' ? request.service?.nameMg ?? t(request.type) : request.service?.nameFr ?? t(request.type)}</div>
                  </div>
                  <span className="status en_traitement" style={{ whiteSpace: 'nowrap' }}>{t(statusLabels[request.status] ?? request.status.replace(/_/g, ' ').toLowerCase())}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
