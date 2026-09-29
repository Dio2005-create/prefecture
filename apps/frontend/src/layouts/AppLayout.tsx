import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Archive, Bell, Bot, CalendarDays, FileText, LayoutDashboard, Menu, Search, ShieldCheck, X, ChevronRight, UserRound, BriefcaseBusiness, CheckSquare, LogOut, Settings, KeyRound } from 'lucide-react';
import { useAuth, type AuthUser } from '../auth';

type AppLayoutVariant = 'frontoffice' | 'backoffice';

const citizenNavigation = [
  { to: '/front/accueil', label: 'Accueil citoyen', icon: LayoutDashboard },
  { to: '/front/demandes', label: 'Mes démarches', icon: FileText },
  { to: '/front/documents', label: 'Mes documents', icon: FileText },
  { to: '/front/informations', label: 'Textes officiels', icon: FileText },
  { to: '/front/notifications', label: 'Notifications', icon: Bell },
  { to: '/front/rendez-vous', label: 'Rendez-vous', icon: CalendarDays },
  { to: '/front/signalements', label: 'Signalements', icon: ShieldCheck },
  { to: '/front/assistant', label: 'Assistant IA', icon: Bot },
];

const agentNavigation = [
  { to: '/back/accueil', label: 'Tableau de bord', icon: LayoutDashboard },
  { to: '/back/workflow', label: 'File des dossiers', icon: CheckSquare },
  { to: '/back/modeles', label: 'Modèles documents', icon: FileText },
  { to: '/back/cachets', label: 'Cachets & signatures', icon: ShieldCheck },
  { to: '/back/documents', label: 'Archives', icon: FileText },
  { to: '/back/publications', label: 'Arrêtés & communiqués', icon: FileText },
  { to: '/back/recherche', label: 'Recherche sémantique', icon: Search },
  { to: '/back/assistant', label: 'Assistant IA', icon: Bot },
  { to: '/back/rendez-vous', label: 'Rendez-vous', icon: CalendarDays },
];

const adminNavigation = [...agentNavigation, { to: '/back/pilotage', label: 'KPI et pilotage', icon: BriefcaseBusiness }, { to: '/back/utilisateurs', label: 'Utilisateurs', icon: UserRound }, { to: '/back/parametres', label: 'Paramètres', icon: Settings }];

function getNavigation(variant: AppLayoutVariant, user: AuthUser | null) {
  if (variant === 'frontoffice') return citizenNavigation;
  return user?.role === 'ADMIN' || user?.roles.includes('ADMIN') ? adminNavigation : [];
}

function getProfileName(user: AuthUser | null, variant: AppLayoutVariant) {
  if (variant === 'frontoffice') return user?.nom ?? 'Citoyen';
  return 'Administrateur';
}

export function AppLayout({ children, variant }: { children: ReactNode; variant: AppLayoutVariant }) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const navigation = getNavigation(variant, user);
  const title = variant === 'frontoffice' ? 'Front-Office citoyen' : 'Back-Office préfecture';
  const profileName = getProfileName(user, variant);

  return <div className={variant === 'frontoffice' ? 'app-shell frontoffice-shell' : 'app-shell backoffice-shell'}>
    <aside className={open ? 'sidebar is-open' : 'sidebar'}>
      <div className="brand"><span className="brand-mark"><Archive size={20} /></span><span>ARCHIVIA<small>fonds préfectoral</small></span><button className="icon-button close-nav" onClick={() => setOpen(false)} aria-label="Fermer"><X size={18} /></button></div>
      <p className="nav-caption">{title}</p>
      <nav>{navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === navigation[0].to} onClick={() => setOpen(false)}><Icon size={17} />{label}</NavLink>)}</nav>
      {variant === 'frontoffice' && <div className="front-profile-actions"><button className="icon-button profile-menu-trigger" onClick={() => setProfileMenuOpen((value) => !value)} aria-label="Ouvrir le menu du profil"><Menu size={18} /></button>{profileMenuOpen && <div className="profile-menu"><NavLink to="/front/profil" onClick={() => setProfileMenuOpen(false)}><UserRound size={15} /> Modifier le profil</NavLink><NavLink to="/front/parametres" onClick={() => setProfileMenuOpen(false)}><KeyRound size={15} /> Changer le mot de passe</NavLink><button type="button" onClick={() => { setProfileMenuOpen(false); setConfirmLogout(true); }}><LogOut size={15} /> Déconnexion</button></div>}</div>}
      <div className="sidebar-foot"><ShieldCheck size={16} /><span>Environnement local<small>Traitement confidentiel</small></span></div>
    </aside>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Fermer le menu" />}
    <section className="workspace"><header className="topbar"><button className="icon-button menu-button" onClick={() => setOpen(true)} aria-label="Ouvrir le menu"><Menu size={20} /></button><div className="profile"><span className="avatar">{variant === 'frontoffice' ? <UserRound size={16} /> : <BriefcaseBusiness size={16} />}</span><span><strong>{profileName}</strong><small>Session locale</small></span>{variant === 'backoffice' && <><button className="icon-button profile-menu-trigger" onClick={() => setProfileMenuOpen((value) => !value)} aria-label="Ouvrir le menu du profil"><Menu size={18} /></button>{profileMenuOpen && <div className="profile-menu"><NavLink to="/back/profil" onClick={() => setProfileMenuOpen(false)}><UserRound size={15} /> Modifier le profil</NavLink><NavLink to="/back/mot-de-passe" onClick={() => setProfileMenuOpen(false)}><KeyRound size={15} /> Changer le mot de passe</NavLink><button type="button" onClick={() => { setProfileMenuOpen(false); setConfirmLogout(true); }}><LogOut size={15} /> Déconnexion</button></div>}</>}</div></header><main className="content">{children}</main></section>
    {confirmLogout && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logout-title"><p className="eyebrow">Session sécurisée</p><h2 id="logout-title">Confirmer la déconnexion</h2><p>Votre session locale sera fermée sur cet appareil.</p><div className="modal-actions"><button className="button" onClick={() => setConfirmLogout(false)}>Annuler</button><button className="button primary" onClick={() => { setConfirmLogout(false); void logout(); }}>Se déconnecter</button></div></section></div>}
  </div>;
}
