import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Archive, Bell, Bot, CalendarDays, FileText, LayoutDashboard, Menu, Search, ShieldCheck, X, UserRound, BriefcaseBusiness, CheckSquare, LogOut, Settings, KeyRound, Languages, Moon, Sun } from 'lucide-react';
import { useAuth, type AuthUser } from '../auth';
import { usePreferences } from '../preferences';

type AppLayoutVariant = 'frontoffice' | 'backoffice';

const citizenNavigation = [
  { to: '/front/accueil', label: 'Accueil citoyen', labelMg: 'Fandraisana', icon: LayoutDashboard },
  { to: '/front/demandes', label: 'Mes démarches', labelMg: 'Ny fangatahako', icon: FileText },
  { to: '/front/documents', label: 'Mes documents', labelMg: 'Ny taratasiko', icon: FileText },
  { to: '/front/informations', label: 'Textes officiels', labelMg: 'Lalàna ofisialy', icon: FileText },
  { to: '/front/notifications', label: 'Notifications', labelMg: 'Fampandrenesana', icon: Bell },
  { to: '/front/rendez-vous', label: 'Rendez-vous', labelMg: 'Fotoana', icon: CalendarDays },
  { to: '/front/signalements', label: 'Signalements', labelMg: 'Fitarainana', icon: ShieldCheck },
  { to: '/front/assistant', label: 'Assistant IA', labelMg: 'Mpanampy IA', icon: Bot },
];

const agentNavigation = [
  { to: '/back/accueil', label: 'Tableau de bord', labelMg: 'Tabilao', icon: LayoutDashboard },
  { to: '/back/workflow', label: 'File des dossiers', labelMg: 'Filaharan’ny dosie', icon: CheckSquare },
  { to: '/back/modeles', label: 'Modèles de documents', labelMg: 'Modelin-taratasy', icon: FileText },
  { to: '/back/cachets', label: 'Cachets & signatures', labelMg: 'Tombokase sy sonia', icon: ShieldCheck },
  { to: '/back/documents', label: 'Archives', labelMg: 'Tahiry', icon: FileText },
  { to: '/back/publications', label: 'Arrêtés & communiqués', labelMg: 'Didy sy fampahafantarana', icon: FileText },
  { to: '/back/recherche', label: 'Recherche sémantique', labelMg: 'Fikarohana', icon: Search },
  { to: '/back/assistant', label: 'Assistant IA', labelMg: 'Mpanampy IA', icon: Bot },
  { to: '/back/rendez-vous', label: 'Rendez-vous', labelMg: 'Fotoana', icon: CalendarDays },
];

const adminNavigation = [...agentNavigation, { to: '/back/pilotage', label: 'KPI et pilotage', labelMg: 'Tondro', icon: BriefcaseBusiness }, { to: '/back/utilisateurs', label: 'Utilisateurs', labelMg: 'Mpampiasa', icon: UserRound }, { to: '/back/parametres', label: 'Paramètres', labelMg: 'Fikirana', icon: Settings }];

function getNavigation(variant: AppLayoutVariant, user: AuthUser | null) {
  if (variant === 'frontoffice') return citizenNavigation;
  return user?.role === 'ADMIN' || user?.roles.includes('ADMIN') ? adminNavigation : [];
}

function getProfileName(user: AuthUser | null, variant: AppLayoutVariant, language: 'fr' | 'mg') {
  if (variant === 'frontoffice') return user?.nom ?? (language === 'mg' ? 'Olom-pirenena' : 'Citoyen');
  return language === 'mg' ? 'Mpandrindra' : 'Administrateur';
}

function NavigationPreferences() {
  const { language, setLanguage, theme, toggleTheme, t } = usePreferences();
  return <div className="nav-preferences">
    <span className="nav-preferences-label"><Languages size={15} /></span>
    <div className="language-switch" role="group" aria-label="Langue / Fiteny">
      <button type="button" aria-pressed={language === 'fr'} onClick={() => setLanguage('fr')}>FR</button>
      <button type="button" aria-pressed={language === 'mg'} onClick={() => setLanguage('mg')}>MG</button>
    </div>
    <button className="icon-button theme-toggle" type="button" onClick={toggleTheme} aria-label={t(theme === 'light' ? 'Activer le mode sombre' : 'Activer le mode clair')} title={t(theme === 'light' ? 'Mode sombre' : 'Mode clair')}>
      {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  </div>;
}

export function AppLayout({ children, variant }: { children: ReactNode; variant: AppLayoutVariant }) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const { language, t } = usePreferences();
  const navigation = getNavigation(variant, user);
  const title = variant === 'backoffice'
    ? t('Back-Office préfecture')
    : '';
  const profileName = getProfileName(user, variant, language);

  return <div className={variant === 'frontoffice' ? 'app-shell frontoffice-shell' : 'app-shell backoffice-shell'}>
    <aside className={open ? 'sidebar is-open' : 'sidebar'}>
      <div className="brand"><span className="brand-mark"><Archive size={20} /></span><span>ARCHIVIA<small>{t('fonds préfectoral')}</small></span><button className="icon-button close-nav" onClick={() => setOpen(false)} aria-label={t('Fermer')}><X size={18} /></button></div>
      {title && <p className="nav-caption">{title}</p>}
      <nav>{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === navigation[0].to} onClick={() => setOpen(false)}><Icon size={17} />{t(label)}</NavLink>)}</nav>
      {variant === 'frontoffice' && <div className="front-profile-actions"><button className="icon-button profile-menu-trigger" onClick={() => setProfileMenuOpen((value) => !value)} aria-label={t('Ouvrir le menu du profil')}><Menu size={18} /></button>{profileMenuOpen && <div className="profile-menu"><NavLink to="/front/profil" onClick={() => setProfileMenuOpen(false)}><UserRound size={15} /> {t('Modifier le profil')}</NavLink><NavLink to="/front/parametres" onClick={() => setProfileMenuOpen(false)}><KeyRound size={15} /> {t('Changer le mot de passe')}</NavLink><button type="button" onClick={() => { setProfileMenuOpen(false); setConfirmLogout(true); }}><LogOut size={15} /> {t('Déconnexion')}</button></div>}</div>}
      <div className="sidebar-foot"><ShieldCheck size={16} /><span>{t('Environnement local')}<small>{t('Traitement confidentiel')}</small></span></div>
    </aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label={t('Fermer le menu')} />}
    <section className="workspace"><header className="topbar"><button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label={t('Ouvrir le menu')}><Menu size={20} /></button><NavigationPreferences /><div className="profile"><span className="avatar">{variant === 'frontoffice' ? <UserRound size={16} /> : <BriefcaseBusiness size={16} />}</span><span><strong>{profileName}</strong><small>{t('Session locale')}</small></span>{variant === 'backoffice' && <><button className="icon-button profile-menu-trigger" onClick={() => setProfileMenuOpen((value) => !value)} aria-label={t('Ouvrir le menu du profil')}><Menu size={18} /></button>{profileMenuOpen && <div className="profile-menu"><NavLink to="/back/profil" onClick={() => setProfileMenuOpen(false)}><UserRound size={15} /> {t('Modifier le profil')}</NavLink><NavLink to="/back/mot-de-passe" onClick={() => setProfileMenuOpen(false)}><KeyRound size={15} /> {t('Changer le mot de passe')}</NavLink><button type="button" onClick={() => { setProfileMenuOpen(false); setConfirmLogout(true); }}><LogOut size={15} /> {t('Déconnexion')}</button></div>}</>}</div></header><main className="content">{children}</main></section>
    {confirmLogout && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logout-title"><p className="eyebrow">{t('Session sécurisée')}</p><h2 id="logout-title">{t('Confirmer la déconnexion')}</h2><p>{t('Votre session locale sera fermée sur cet appareil.')}</p><div className="modal-actions"><button className="button" onClick={() => setConfirmLogout(false)}>{t('Annuler')}</button><button className="button primary" onClick={() => { setConfirmLogout(false); void logout(); }}>{t('Se déconnecter')}</button></div></section></div>}
  </div>;
}
