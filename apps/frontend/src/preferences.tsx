import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { translateText } from './translations';

export type AppLanguage = 'fr' | 'mg';
export type AppTheme = 'light' | 'dark';

interface PreferencesContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  theme: AppTheme;
  toggleTheme: () => void;
  t: (text: string, values?: Record<string, string | number>) => string;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(() => localStorage.getItem('archives-language') === 'mg' ? 'mg' : 'fr');
  const [theme, setTheme] = useState<AppTheme>(() => localStorage.getItem('archives-theme') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.lang = language;
    localStorage.setItem('archives-language', language);
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('archives-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => current === 'light' ? 'dark' : 'light');
  const t = (text: string, values?: Record<string, string | number>) => translateText(language, text, values);
  return <PreferencesContext.Provider value={{ language, setLanguage, theme, toggleTheme, t }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences doit être utilisé dans PreferencesProvider');
  return context;
}