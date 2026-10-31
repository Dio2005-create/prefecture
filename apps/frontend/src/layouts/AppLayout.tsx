import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Bell, Bot, CalendarDays, FileText, LayoutDashboard, Menu, Search, ShieldCheck, X, UserRound, BriefcaseBusiness, CheckSquare, LogOut, Settings, KeyRound, Languages, Moon, Sun } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useAuth, type AuthUser } from '../auth';
import { usePreferences } from '../preferences';
import { adminService, appointmentService, authService, complaintService, firearmsService, notificationService, prefectureService, userService } from '../services/api';
import type { NotificationItem } from '../types';
import { CITIZEN_DOCUMENT_READ_EVENT, getReadCitizenDocuments } from '../citizen-document-read';

type AppLayoutVariant = 'frontoffice' | 'backoffice';

const citizenNavigation = [
  { to: '/front/accueil', label: 'Accueil citoyen', labelMg: 'Fandraisana', icon: LayoutDashboard },
  { to: '/front/demandes', label: 'Mes démarches', labelMg: 'Ny fangatahako', icon: FileText },
  { to: '/front/armements', label: 'Contrôle des armements', labelMg: 'Fanaraha-maso fitaovam-piadiana', icon: ShieldCheck },
  { to: '/front/documents', label: 'Mes documents', labelMg: 'Ny taratasiko', icon: FileText },
  { to: '/front/informations', label: 'Textes officiels', labelMg: 'Lalàna ofisialy', icon: FileText },
  { to: '/front/rendez-vous', label: 'Rendez-vous', labelMg: 'Fotoana', icon: CalendarDays },
  { to: '/front/reclamations', label: 'Réclamations', labelMg: 'Fitarainana', icon: ShieldCheck },
];

const agentNavigation = [
  { to: '/back/accueil', label: 'Tableau de bord', labelMg: 'Tabilao', icon: LayoutDashboard },
  { to: '/back/workflow', label: 'File des dossiers', labelMg: 'Filaharan’ny dosie', icon: CheckSquare },
  { to: '/back/reclamations', label: 'Réclamations citoyennes', labelMg: 'Fitarainana', icon: ShieldCheck },
  { to: '/back/armements', label: 'Contrôle des armements', labelMg: 'Fanaraha-maso fitaovam-piadiana', icon: ShieldCheck },
  { to: '/back/documents', label: 'Archives', labelMg: 'Tahiry', icon: FileText },
  { to: '/back/publications', label: 'Arrêtés & communiqués', labelMg: 'Didy sy fampahafantarana', icon: FileText },
  { to: '/back/recherche', label: 'Recherche sémantique', labelMg: 'Fikarohana', icon: Search },
  { to: '/back/rendez-vous', label: 'Rendez-vous', labelMg: 'Fotoana', icon: CalendarDays },
];

const adminNavigation = [...agentNavigation, { to: '/back/utilisateurs', label: 'Utilisateurs', labelMg: 'Mpampiasa', icon: UserRound }, { to: '/back/parametres', label: 'Paramètres', labelMg: 'Fikirana', icon: Settings }];

function getNavigation(variant: AppLayoutVariant, user: AuthUser | null) {
  if (variant === 'frontoffice') return citizenNavigation;
  return user?.role === 'ADMIN' || user?.roles.includes('ADMIN') || user?.roles.includes('SUPERADMIN') ? adminNavigation : [];
}

function getProfileName(user: AuthUser | null, variant: AppLayoutVariant, language: 'fr' | 'mg') {
  if (variant === 'frontoffice') return user?.nom ?? (language === 'mg' ? 'Olom-pirenena' : 'Citoyen');
  return language === 'mg' ? 'Mpandrindra' : 'Administrateur';
}

function NavigationPreferences({ showNotifications, showAdminNotifications = false, showCitizenAssistant = false, showAdminAssistant = false }: { showNotifications: boolean; showAdminNotifications?: boolean; showCitizenAssistant?: boolean; showAdminAssistant?: boolean }) {
  const { language, setLanguage, theme, toggleTheme, t } = usePreferences();
  const { authenticated, user, updateUser } = useAuth();
  const { pathname } = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const queryClient = useQueryClient();
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationService.list,
    enabled: showNotifications || showAdminNotifications,
    refetchInterval: showNotifications || showAdminNotifications ? 30000 : false,
  });
  const unreadCount = notifications.filter((notification: NotificationItem) => notification.status !== 'READ').length;
  useEffect(() => {
    setNotificationsOpen(false);
  }, [pathname]);
  const markRead = async (id: string) => {
    await notificationService.markAsRead(id);
    await queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const changeLanguage = async (nextLanguage: 'fr' | 'mg') => {
    setLanguageError(false);
    if (!authenticated || !user) {
      setLanguage(nextLanguage);
      return;
    }
    try {
      const result = await authService.updateLocale(nextLanguage);
      updateUser(result.user as AuthUser);
      setLanguage(nextLanguage);
    } catch {
      setLanguageError(true);
    }
  };
  return <div className="nav-preferences">
    <span className="nav-preferences-label"><Languages size={15} /></span>
    <div className="language-switch" role="group" aria-label="Langue / Fiteny">
      <button type="button" aria-pressed={language === 'fr'} onClick={() => void changeLanguage('fr')}>FR</button>
      <button type="button" aria-pressed={language === 'mg'} onClick={() => void changeLanguage('mg')}>MG</button>
    </div>
    {languageError && <span className="language-preference-error" role="alert">{t('Impossible d’enregistrer la langue. Réessayez.')}</span>}
    {showNotifications && <NavLink className="icon-button notification-nav-button" to="/front/notifications" aria-label={t('Notifications non lues : {{count}}', { count: unreadCount })} title={t('Notifications')}>
      <Bell size={17} />
      {unreadCount > 0 && <span className="notification-nav-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </NavLink>}
    {showCitizenAssistant && <NavLink className="icon-button" to="/front/assistant" aria-label={t('Assistant IA')} title={t('Assistant IA')}>
      <Bot size={17} />
    </NavLink>}
    {showAdminNotifications && <div className="admin-notification-control">
      <button className="icon-button notification-nav-button" type="button" aria-expanded={notificationsOpen} aria-label={t('Notifications non lues : {{count}}', { count: unreadCount })} title={t('Notifications')} onClick={() => setNotificationsOpen((open) => !open)}>
        <Bell size={17} />
        {unreadCount > 0 && <span className="notification-nav-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>
      {notificationsOpen && <section className="admin-notification-popover" aria-label={t('Notifications')}>
        <div className="admin-notification-heading"><strong>{t('Notifications')}</strong><NavLink to="/back/notifications" onClick={() => setNotificationsOpen(false)}>{t('Tout voir')}</NavLink></div>
        {notifications.length === 0 ? <p className="muted">{t('Aucune notification.')}</p> : notifications.slice(0, 6).map((notification: NotificationItem) => <article key={notification.id} className={notification.status === 'READ' ? 'admin-notification-read' : ''}>
          <span><strong>{t(notification.title)}</strong><small>{t(notification.message)}</small></span>
          {notification.status !== 'READ' && <button type="button" className="text-link" onClick={() => void markRead(notification.id)}>{t('Marquer lue')}</button>}
        </article>)}
      </section>}
    </div>}
    {showAdminAssistant && <NavLink className="icon-button" to="/back/assistant" aria-label={t('Assistant IA')} title={t('Assistant IA')}>
      <Bot size={17} />
    </NavLink>}
    <button className="icon-button theme-toggle" type="button" onClick={toggleTheme} aria-label={t(theme === 'light' ? 'Activer le mode sombre' : 'Activer le mode clair')} title={t(theme === 'light' ? 'Mode sombre' : 'Mode clair')}>
      {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  </div>;
}

export function AppLayout({ children, variant }: { children: ReactNode; variant: AppLayoutVariant }) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [profileMenuPosition, setProfileMenuPosition] = useState({ top: 8, right: 8 });
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const { logout, user } = useAuth();
  const { language, setLanguage, t } = usePreferences();
  const isAdmin = variant === 'backoffice' && Boolean(user && (user.role === 'ADMIN' || user.roles.includes('ADMIN') || user.roles.includes('SUPERADMIN')));
  const { data: adminRequests = [] } = useQuery({
    queryKey: ['admin-navigation-requests'],
    queryFn: () => adminService.listRequests(),
    enabled: isAdmin,
    refetchInterval: isAdmin ? 30000 : false,
  });
  const { data: firearmRequests = [] } = useQuery({
    queryKey: ['admin-navigation-firearm-requests'],
    queryFn: () => firearmsService.listAdminRequests(),
    enabled: isAdmin,
    refetchInterval: isAdmin ? 30000 : false,
  });
  const { data: complaints = [] } = useQuery({
    queryKey: ['admin-navigation-complaints'],
    queryFn: complaintService.listAdmin,
    enabled: isAdmin,
    refetchInterval: isAdmin ? 30000 : false,
  });
  const { data: adminAppointments = [] } = useQuery({
    queryKey: ['admin-navigation-appointments'],
    queryFn: appointmentService.listForAdmin,
    enabled: isAdmin,
    refetchInterval: isAdmin ? 30000 : false,
  });
  const { data: passwordResetRequests = [] } = useQuery({
    queryKey: ['admin-navigation-password-resets'],
    queryFn: userService.passwordResetRequests,
    enabled: isAdmin,
    refetchInterval: isAdmin ? 30000 : false,
  });
  const { data: reactivationRequests = [] } = useQuery({
    queryKey: ['admin-navigation-reactivations'],
    queryFn: userService.reactivationRequests,
    enabled: isAdmin,
    refetchInterval: isAdmin ? 30000 : false,
  });
  const { data: citizenRequests = [] } = useQuery({
    queryKey: ['citizen-navigation-requests', user?.id],
    queryFn: prefectureService.listRequests,
    enabled: variant === 'frontoffice' && Boolean(user?.id),
    refetchInterval: variant === 'frontoffice' ? 30000 : false,
  });
  const [, refreshCitizenDocumentCount] = useState(0);
  useEffect(() => {
    const refresh = () => refreshCitizenDocumentCount((value) => value + 1);
    window.addEventListener(CITIZEN_DOCUMENT_READ_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CITIZEN_DOCUMENT_READ_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const navigation = getNavigation(variant, user);
  const readCitizenDocuments = getReadCitizenDocuments(user?.id ?? '');
  const navigationCounts: Record<string, number> = {
    '/back/workflow': adminRequests.filter((request) => request.status === 'SUBMITTED').length,
    '/back/armements': firearmRequests.filter((request) => request.status === 'PENDING').length,
    '/back/reclamations': complaints.filter((complaint) => complaint.status === 'PENDING').length,
    '/back/rendez-vous': adminAppointments.filter((request) => request.status === 'PENDING').length,
    '/back/utilisateurs': passwordResetRequests.length + reactivationRequests.filter((request) => request.status === 'PENDING').length,
    '/front/documents': citizenRequests.filter((request) => request.status === 'APPROVED' && !readCitizenDocuments.includes(request.id)).length,
  };
  const title = variant === 'backoffice'
    ? t('Back-Office préfecture')
    : '';
  const profileName = getProfileName(user, variant, language);
  useLayoutEffect(() => {
    if (user?.locale === 'fr' || user?.locale === 'mg') setLanguage(user.locale);
  }, [setLanguage, user?.id, user?.locale]);
  useEffect(() => {
    setProfileMenuOpen(false);
    setOpen(false);
  }, [pathname]);
  useLayoutEffect(() => {
    if (!profileMenuOpen) return;
    const positionMenu = () => {
      const trigger = profileTriggerRef.current;
      const menu = profileMenuRef.current;
      if (!trigger || !menu) return;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const margin = 8;
      const right = Math.max(margin, Math.min(window.innerWidth - triggerRect.right, window.innerWidth - menuRect.width - margin));
      const top = Math.max(margin, Math.min(triggerRect.bottom + margin, window.innerHeight - menuRect.height - margin));
      setProfileMenuPosition({ top, right });
    };
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [profileMenuOpen]);
  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!profileTriggerRef.current?.contains(target) && !profileMenuRef.current?.contains(target)) {
        setProfileMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileMenuOpen]);
  const sidebar = <aside className={open ? 'sidebar is-open' : 'sidebar'}>
    <div className="brand"><span className="brand-mark"><Archive size={20} /></span><span>ARCHIVIA<small>{t('fonds préfectoral')}</small></span><button className="icon-button close-nav" onClick={() => setOpen(false)} aria-label={t('Fermer')}><X size={18} /></button></div>
    {title && <p className="nav-caption">{title}</p>}
    <nav>{navigation.map(({ to, label, icon: Icon }) => {
      const count = navigationCounts[to] ?? 0;
      return <Fragment key={to}>
      <NavLink to={to} end={to === navigation[0].to} aria-label={count > 0 ? t('{{label}} : {{count}} demandes en attente', { label: t(label), count }) : undefined} onClick={() => { setOpen(false); setProfileMenuOpen(false); }}><Icon size={17} />{t(label)}{count > 0 && <span className="nav-pending-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>}</NavLink>
    </Fragment>;
    })}
    {variant === 'frontoffice' && <button ref={profileTriggerRef} className="icon-button nav-menu-button" type="button" aria-expanded={profileMenuOpen} aria-label={t(profileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu')} onClick={() => setProfileMenuOpen((value) => !value)}><Menu size={18} /></button>}
    </nav>
    <div className="sidebar-foot"><ShieldCheck size={16} /><span>{t('Environnement local')}<small>{t('Traitement confidentiel')}</small></span></div>
  </aside>;
  const profilePath = variant === 'frontoffice' ? '/front/profil' : '/back/profil';
  const passwordPath = variant === 'frontoffice' ? '/front/parametres' : '/back/mot-de-passe';
  const topbar = <header className="topbar">{variant === 'backoffice' && <button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label={t('Ouvrir le menu')}><Menu size={20} /></button>}<NavigationPreferences showNotifications={variant === 'frontoffice'} showAdminNotifications={variant === 'backoffice'} showCitizenAssistant={variant === 'frontoffice'} showAdminAssistant={variant === 'backoffice'} />  <div className="profile"><span className="avatar">{variant === 'frontoffice' ? <UserRound size={16} /> : <BriefcaseBusiness size={16} />}</span><span className="profile-identity"><strong>{profileName}</strong><span className="online-indicator" role="img" aria-label={t('En ligne')} title={t('En ligne')} /></span>{variant === 'backoffice' && <button ref={profileTriggerRef} className="icon-button profile-menu-trigger" type="button" aria-expanded={profileMenuOpen} aria-label={t('Ouvrir le menu du profil')} onClick={() => setProfileMenuOpen((value) => !value)}><UserRound size={17} /></button>}</div></header>;
  return <div className={`${variant === 'frontoffice' ? 'app-shell frontoffice-shell' : 'app-shell backoffice-shell'}${variant === 'frontoffice' && open ? ' navigation-open' : ''}`}>
    {variant === 'frontoffice' ? <div className="frontoffice-sticky-header">{sidebar}{topbar}</div> : sidebar}
    {open && variant === 'backoffice' && <button className="scrim" onClick={() => setOpen(false)} aria-label={t('Fermer le menu')} />}
    <section className="workspace">{variant === 'backoffice' && topbar}<main className="content">{children}</main></section>
    {profileMenuOpen && createPortal(<div ref={profileMenuRef} className="profile-menu profile-menu-portal" style={profileMenuPosition}>
      <NavLink to={profilePath} onClick={() => setProfileMenuOpen(false)}><UserRound size={15} /> {t('Mon profil')}</NavLink>
      <NavLink to={passwordPath} onClick={() => setProfileMenuOpen(false)}><KeyRound size={15} /> {t('Changer le mot de passe')}</NavLink>
      <button type="button" onClick={() => { setProfileMenuOpen(false); setConfirmLogout(true); }}><LogOut size={15} /> {t('Déconnexion')}</button>
    </div>, document.body)}
    {confirmLogout && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logout-title"><p className="eyebrow">{t('Session sécurisée')}</p><h2 id="logout-title">{t('Confirmer la déconnexion')}</h2><p>{t('Votre session locale sera fermée sur cet appareil.')}</p><div className="modal-actions"><button className="button" onClick={() => setConfirmLogout(false)}>{t('Annuler')}</button><button className="button primary" onClick={() => { setConfirmLogout(false); void logout(variant === 'backoffice'); }}>{t('Se déconnecter')}</button></div></section></div>}
  </div>;
}
