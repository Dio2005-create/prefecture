import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authService, getSessionKeys } from './services/api';
import { LoadingPage } from './components/ui';

const TIMEOUT = 5 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string | null;
  nom: string | null;
  phone?: string | null;
  cin?: string | null;
  locale?: string;
  role: 'CITIZEN' | 'ADMIN' | 'SUPERADMIN';
  roles: string[];
  mustChangePassword?: boolean;
};

function isAdminUser(user: AuthUser) {
  return user.role === 'ADMIN' || user.roles.includes('ADMIN') || user.roles.includes('SUPERADMIN');
}

type AuthContextValue = {
  authenticated: boolean;
  restoringSession: boolean;
  user: AuthUser | null;
  login: (username: string, password: string, adminPortal?: boolean) => Promise<AuthUser | null>;
  register: (payload: { email?: string; password: string; phone?: string; cin?: string; nom?: string; isAdult: boolean }) => Promise<AuthUser | null>;
  logout: (adminPortal?: boolean) => Promise<void>;
  updateUser: (user: AuthUser) => void;
};
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session: sessionKey, activity: activityKey } = getSessionKeys(pathname);

  useEffect(() => {
    let token = localStorage.getItem(sessionKey);
    const legacyToken = token ? null : localStorage.getItem('archives-session');
    token ??= legacyToken;
    if (!token) { setRestoringSession(false); return; }
    const legacyActivity = legacyToken ? localStorage.getItem('archives-last-activity') : null;
    const lastActivity = Number(localStorage.getItem(activityKey) ?? legacyActivity);
    if (lastActivity && Date.now() - lastActivity >= TIMEOUT) {
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(activityKey);
      if (legacyToken) {
        localStorage.removeItem('archives-session');
        localStorage.removeItem('archives-last-activity');
      }
      setRestoringSession(false);
      return;
    }
    if (!lastActivity) localStorage.setItem(activityKey, String(Date.now()));
    void authService.validate(token).then((session) => {
      const restoredUser = session.user as AuthUser;
      if (legacyToken) {
        const keys = isAdminUser(restoredUser)
          ? { session: 'archives-session-admin', activity: 'archives-last-activity-admin' }
          : { session: 'archives-session-citizen', activity: 'archives-last-activity-citizen' };
        localStorage.setItem(keys.session, token);
        localStorage.setItem(keys.activity, String(lastActivity || Date.now()));
        localStorage.removeItem('archives-session');
        localStorage.removeItem('archives-last-activity');
      }
      setUser(restoredUser);
      setAuthenticated(true);
    }).catch(() => {
      localStorage.removeItem(sessionKey);
      localStorage.removeItem(activityKey);
      if (legacyToken) {
        localStorage.removeItem('archives-session');
        localStorage.removeItem('archives-last-activity');
      }
      setUser(null);
      setAuthenticated(false);
    }).finally(() => setRestoringSession(false));
  }, [activityKey, sessionKey]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setAuthenticated(false);
      setRestoringSession(false);
    };
    window.addEventListener('archives:session-expired', handleSessionExpired);
    return () => window.removeEventListener('archives:session-expired', handleSessionExpired);
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let timer: number;
    const scheduleLogout = () => {
      window.clearTimeout(timer);
      const lastActivity = Number(localStorage.getItem(activityKey)) || Date.now();
      timer = window.setTimeout(() => { void logout(); }, Math.max(0, lastActivity + TIMEOUT - Date.now()));
    };
    const refresh = () => {
      localStorage.setItem(activityKey, String(Date.now()));
      scheduleLogout();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, refresh));
    scheduleLogout();
    return () => { window.clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, refresh)); };
  }, [authenticated, activityKey]);

  const login = async (identifier: string, password: string, adminPortal = false) => {
    try {
      const session = await authService.login(identifier, password, adminPortal);
      const keys = adminPortal
        ? { session: 'archives-session-admin', activity: 'archives-last-activity-admin' }
        : { session: 'archives-session-citizen', activity: 'archives-last-activity-citizen' };
      localStorage.setItem(keys.session, session.token);
      localStorage.setItem(keys.activity, String(Date.now()));
      const authenticatedUser = session.user as AuthUser;
      setUser(authenticatedUser);
      setAuthenticated(true);
      return authenticatedUser;
    } catch (error) {
      throw error;
    }
  };
  const register = async (payload: { email?: string; password: string; phone?: string; cin?: string; nom?: string; isAdult: boolean }) => {
    try {
      const session = await authService.register(payload);
      const keys = { session: 'archives-session-citizen', activity: 'archives-last-activity-citizen' };
      localStorage.setItem(keys.session, session.token);
      localStorage.setItem(keys.activity, String(Date.now()));
      const authenticatedUser = session.user as AuthUser;
      setUser(authenticatedUser);
      setAuthenticated(true);
      return authenticatedUser;
    } catch (error) { throw error; }
  };
  const logout = async (adminPortal = sessionKey === 'archives-session-admin') => {
    const keys = adminPortal
      ? { session: 'archives-session-admin', activity: 'archives-last-activity-admin' }
      : { session: 'archives-session-citizen', activity: 'archives-last-activity-citizen' };
    const token = localStorage.getItem(keys.session);
    try {
      await authService.logout(token);
    } finally {
      localStorage.removeItem(keys.session);
      localStorage.removeItem(keys.activity);
      setAuthenticated(false);
      setUser(null);
      navigate(adminPortal ? '/login/admin' : '/login', { replace: true });
    }
  };
  const updateUser = (updatedUser: AuthUser) => setUser(updatedUser);
  return <AuthContext.Provider value={{ authenticated, user, login, register, logout, updateUser, restoringSession }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider');
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { authenticated, restoringSession } = useAuth();
  const location = useLocation();
  if (restoringSession) return <LoadingPage />;
  return authenticated ? children : <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

export function RequireRoles({ roles, children }: { roles: string[]; children: ReactNode }) {
  const { authenticated, user, restoringSession } = useAuth();
  const location = useLocation();
  if (restoringSession) return <LoadingPage />;
  if (!authenticated) return <Navigate to="/login/admin" replace state={{ from: location.pathname }} />;
  if (!user || !roles.some((role) => user.roles.includes(role) || (role === 'ADMIN' && (user.role === 'ADMIN' || user.roles.includes('SUPERADMIN'))))) {
    return <Navigate to="/front/accueil" replace />;
  }
  return children;
}

export function RequireCitizen({ children }: { children: ReactNode }) {
  const { authenticated, user, restoringSession } = useAuth();
  const location = useLocation();
  if (restoringSession) return <LoadingPage />;
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user || (user.role !== 'CITIZEN' && !user.roles.includes('CITIZEN'))) return <Navigate to="/back/accueil" replace />;
  return children;
}

export function RoleLanding() {
  const { authenticated, user, restoringSession } = useAuth();
  if (restoringSession) return <LoadingPage />;
  if (!authenticated) return <Navigate to="/login" replace />;
  return user?.role === 'CITIZEN' || user?.roles.includes('CITIZEN') ? <Navigate to="/front/accueil" replace /> : <Navigate to="/back/accueil" replace />;
}