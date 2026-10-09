import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { authService } from './services/api';
import { LoadingPage } from './components/ui';

const SESSION_KEY = 'archives-session';
const ACTIVITY_KEY = 'archives-last-activity';
const TIMEOUT = 5 * 60 * 1000;

export type AuthUser = {
  id: string;
  email: string;
  nom: string | null;
  phone?: string | null;
  cin?: string | null;
  role: 'CITIZEN' | 'ADMIN';
  roles: string[];
};

type AuthContextValue = {
  authenticated: boolean;
  restoringSession: boolean;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<AuthUser | null>;
  register: (payload: { email: string; password: string; phone?: string; cin?: string; nom?: string; isAdult: boolean }) => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  updateUser: (user: AuthUser) => void;
};
const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(SESSION_KEY);
    if (!token) { setRestoringSession(false); return; }
    const lastActivity = Number(localStorage.getItem(ACTIVITY_KEY));
    if (lastActivity && Date.now() - lastActivity >= TIMEOUT) {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
      setRestoringSession(false);
      return;
    }
    if (!lastActivity) localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    void authService.validate(token).then((session) => {
      setUser(session.user as AuthUser);
      setAuthenticated(true);
    }).catch(() => {
      localStorage.removeItem(SESSION_KEY);
      setUser(null);
      setAuthenticated(false);
    }).finally(() => setRestoringSession(false));
  }, []);

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
      const lastActivity = Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now();
      timer = window.setTimeout(() => { void logout(); }, Math.max(0, lastActivity + TIMEOUT - Date.now()));
    };
    const refresh = () => {
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      scheduleLogout();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event) => window.addEventListener(event, refresh));
    scheduleLogout();
    return () => { window.clearTimeout(timer); events.forEach((event) => window.removeEventListener(event, refresh)); };
  }, [authenticated]);

  const login = async (identifier: string, password: string) => {
    try {
      const session = await authService.login(identifier, password);
      localStorage.setItem(SESSION_KEY, session.token);
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      const authenticatedUser = session.user as AuthUser;
      setUser(authenticatedUser);
      setAuthenticated(true);
      return authenticatedUser;
    } catch (error) {
      throw error;
    }
  };
  const register = async (payload: { email: string; password: string; phone?: string; cin?: string; nom?: string; isAdult: boolean }) => {
    try {
      const session = await authService.register(payload);
      localStorage.setItem(SESSION_KEY, session.token);
      localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      const authenticatedUser = session.user as AuthUser;
      setUser(authenticatedUser);
      setAuthenticated(true);
      return authenticatedUser;
    } catch { return null; }
  };
  const logout = async () => { const token = localStorage.getItem(SESSION_KEY); try { await authService.logout(token); } finally { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(ACTIVITY_KEY); setAuthenticated(false); setUser(null); } };
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
  if (!authenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!user || !roles.some((role) => user.roles.includes(role) || (role === 'ADMIN' && user.role === 'ADMIN'))) {
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