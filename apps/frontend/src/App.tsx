import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
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
  ComplaintPage,
  NotificationsPage,
  OfficialInformationPage,
  UsersPage,
} from './pages/RoleFeaturePages';
import { AppointmentsPage } from './pages/AppointmentsPage';
import { CitizenSettingsPage } from './pages/CitizenSettingsPage';
import { CitizenProfilePage } from './pages/CitizenProfilePage';
import { AdminSettingsPage } from './pages/RoleFeaturePages';
import { PreferencesProvider } from './preferences';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <PreferencesProvider>
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
                      <Route path="signalements" element={<ComplaintPage />} />
                      <Route path="assistant" element={<CitizenAssistantPage />} />
                      <Route path="parametres" element={<CitizenSettingsPage />} />
                      <Route path="profil" element={<CitizenProfilePage />} />
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
                    </Routes>
                  </AppLayout>
                </RequireRoles>
              }
            />
          </Routes>
        </AuthProvider>
        </PreferencesProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
