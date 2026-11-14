import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NavLink } from 'react-router-dom';
import { ArrowRight, Check, CheckCircle2, ClipboardCheck, FileCheck2, FileText, Send, Smartphone, Sparkles, UserRound, XCircle } from 'lucide-react';
import { prefectureService } from '../services/api';
import { usePreferences } from '../preferences';

export function CitizenDashboardPage() {
  const { t, language } = usePreferences();
  const { data: services, isLoading: loadingServices } = useQuery({
    queryKey: ['prefecture-services'],
    queryFn: prefectureService.listServices,
  });

  const { data: requests } = useQuery({
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

      <section className="citizen-home-grid">
        <div className="panel citizen-journey-panel">
          <div className="citizen-journey-heading">
            <div>
              <p className="eyebrow">{t('Démarche en ligne')}</p>
              <h2>{t('Votre dossier avance, étape par étape')}</h2>
              <p>{t('Un parcours simple, du dépôt de votre demande à sa validation.')}</p>
            </div>
            <span className="citizen-journey-live"><i />{t('Suivi en direct')}</span>
          </div>
          <div className="citizen-journey-video" role="img" aria-label={t('Animation : le citoyen envoie une demande depuis son téléphone, l’administration la valide, puis le citoyen reçoit la confirmation')}>
            <div className="citizen-scene-glow" />
            <div className="citizen-scene-halo" />
            <div className="citizen-scene-stage citizen-stage-send"><span>01</span>{t('Envoi depuis le téléphone')}</div>
            <div className="citizen-scene-stage citizen-stage-review"><span>02</span>{t('Validation par l’administration')}</div>
            <div className="citizen-scene-route"><i /><i /><i /><i /><i /></div>
            <div className="citizen-scene-person citizen-scene-citizen">
              <div className="citizen-scene-head"><UserRound size={29} /></div>
              <div className="citizen-scene-body"><i /><i /></div>
              <span className="citizen-scene-caption">{t('Citoyen')}</span>
              <div className="citizen-scene-phone">
                <div className="citizen-phone-speaker" />
                <Smartphone size={14} />
                <small>{t('Ma demande')}</small>
                <span className="citizen-phone-lines"><i /><i /><i /></span>
                <b><Send size={10} />{t('Envoyer')}</b>
              </div>
              <div className="citizen-scene-received"><CheckCircle2 size={17} /><span><strong>{t('Demande reçue !')}</strong><small>{t('Votre dossier est validé')}</small></span></div>
            </div>
            <div className="citizen-request-flight"><FileText size={15} /><span>{t('Dossier')}</span></div>
            <div className="citizen-response-flight"><Check size={15} /></div>
            <div className="citizen-scene-person citizen-scene-admin">
              <div className="citizen-scene-head admin-head"><UserRound size={29} /></div>
              <div className="citizen-scene-body admin-body"><i /><i /></div>
              <span className="citizen-scene-caption">{t('Administration')}</span>
              <div className="citizen-admin-desk">
                <div className="citizen-admin-screen">
                  <span><ClipboardCheck size={16} /><b>{t('Dossier citoyen')}</b></span>
                  <i /><i />
                  <div className="citizen-admin-approved"><Check size={12} />{t('Accepté')}</div>
                </div>
              </div>
            </div>
            <div className="citizen-scene-ground" />
          </div>
          <div className="citizen-journey-footer">
            <span>{t('Envoyez votre demande, suivez sa validation et recevez la confirmation en ligne.')}</span>
            <NavLink to="/front/demandes" className="text-link">{t('Commencer une démarche')} <ArrowRight size={15} /></NavLink>
          </div>
        </div>

        <div className="panel citizen-services-panel">
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
      </section>
    </div>
  );
}
