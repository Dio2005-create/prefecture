import { useEffect, useState } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentsPage, DocumentDetailPage } from './pages/DocumentsPage';
import { ImportPage } from './pages/ImportPage';
import { AssistantPage, CitizenAssistantPage, SearchPage } from './pages/SearchPages';
import { AuthProvider, RequireCitizen, RequireRoles, RoleLanding } from './auth';
import { LoginPage } from './pages/LoginPage';
import { CitizenDashboardPage } from './pages/CitizenDashboardPage';
import { RequestPage } from './pages/RequestPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminWorkflowPage } from './pages/AgentWorkflowPage';
import {
  AdminAppointmentsPage,
  AdminAssociationPage,
  AdminDocumentTemplatesPage,
  AdminPublicationsPage,
  AdminStampAndSignaturePage,
  AssociationAndOngPage,
  CitizenDocumentsPage,
  NotificationsPage,
  OfficialInformationPage,
  UsersPage,
} from './pages/RoleFeaturePages';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { CitizenSettingsPage } from './pages/CitizenSettingsPage';
import { CitizenProfilePage } from './pages/CitizenProfilePage';
import { AdminSettingsPage } from './pages/RoleFeaturePages';
import { AdminComplaintsPage, CitizenComplaintsPage } from './pages/ComplaintsPage';
import { PreferencesProvider, usePreferences } from './preferences';

const queryClient = new QueryClient();

function ConnectionStatusPage({ notFound = false, connectionLost = false }: { notFound?: boolean; connectionLost?: boolean }) {
  const { t } = usePreferences();
  return <main className="status-page">
    <section className="status-page-card">
      <p className="status-page-code">404</p>
      <h1>{t(connectionLost ? 'Connexion interrompue' : notFound ? 'Page introuvable' : 'Connexion Internet indisponible')}</h1>
      <p>{t(connectionLost || !notFound ? 'Vérifiez votre connexion Internet puis réessayez. Si elle fonctionne déjà, le service est peut-être temporairement indisponible.' : 'La page demandée n’existe pas ou a été déplacée.')}</p>
      {notFound && !connectionLost
        ? <Link className="button primary" to="/">{t('Retour à l’accueil')}</Link>
        : <button className="button primary" type="button" onClick={() => window.location.reload()}>{t('Réessayer')}</button>}
    </section>
  </main>;
}

export default function App() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [connectionLost, setConnectionLost] = useState(false);
  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    const handleConnectionError = () => setConnectionLost(true);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    window.addEventListener('archives:connection-error', handleConnectionError);
    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('archives:connection-error', handleConnectionError);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PreferencesProvider>
        {!isOnline ? <ConnectionStatusPage connectionLost /> : connectionLost ? <ConnectionStatusPage connectionLost /> : (
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RoleLanding />} />

            <Route
              path="/front/*"
              element={
                <RequireCitizen>
                  <AppLayout variant="frontoffice">
                    <Routes>
                      <Route path="" element={<Navigate to="/front/accueil" replace />} />
                      <Route path="accueil" element={<CitizenDashboardPage />} />
                      <Route path="demandes" element={<RequestPage />} />
                      <Route path="associations" element={<AssociationAndOngPage />} />
                      <Route path="documents" element={<CitizenDocumentsPage />} />
                      <Route path="informations" element={<OfficialInformationPage />} />
                      <Route path="notifications" element={<NotificationsPage />} />
                      <Route path="rendez-vous" element={<AppointmentsPage />} />
                      <Route path="reclamations" element={<CitizenComplaintsPage />} />
                      <Route path="signalements" element={<Navigate to="/front/reclamations" replace />} />
                      <Route path="assistant" element={<CitizenAssistantPage />} />
                      <Route path="parametres" element={<CitizenSettingsPage />} />
                      <Route path="profil" element={<CitizenProfilePage />} />
                      <Route path="*" element={<ConnectionStatusPage notFound />} />
                    </Routes>
                  </AppLayout>
                </RequireCitizen>
              }
            />

            <Route
              path="/back/*"
              element={
                <RequireRoles roles={['ADMIN']}>
                  <AppLayout variant="backoffice">
                    <Routes>
                      <Route path="" element={<Navigate to="/back/accueil" replace />} />
                      <Route path="accueil" element={<AdminDashboardPage />} />
                      <Route path="workflow" element={<AdminWorkflowPage />} />
                      <Route path="reclamations" element={<AdminComplaintsPage />} />
                      <Route path="notifications" element={<NotificationsPage />} />
                      <Route path="associations" element={<AdminAssociationPage />} />
                      <Route path="pilotage" element={<DashboardPage />} />
                      <Route path="documents" element={<DocumentsPage />} />
                      <Route path="documents/import" element={<ImportPage />} />
                      <Route path="documents/:id" element={<DocumentDetailPage />} />
                      <Route path="modeles" element={<AdminDocumentTemplatesPage />} />
                      <Route path="cachets" element={<AdminStampAndSignaturePage />} />
                      <Route path="publications" element={<AdminPublicationsPage />} />
                      <Route path="recherche" element={<SearchPage />} />
                      <Route path="assistant" element={<AssistantPage />} />
                      <Route path="utilisateurs" element={<UsersPage />} />
                      <Route path="rendez-vous" element={<AdminAppointmentsPage />} />
                      <Route path="parametres" element={<AdminSettingsPage />} />
                      <Route path="profil" element={<CitizenProfilePage />} />
                      <Route path="mot-de-passe" element={<CitizenSettingsPage />} />
                      <Route path="*" element={<ConnectionStatusPage notFound />} />
                    </Routes>
                  </AppLayout>
                </RequireRoles>
              }
            />
            <Route path="*" element={<ConnectionStatusPage notFound />} />
          </Routes>
        </AuthProvider>
        )}
        </PreferencesProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
