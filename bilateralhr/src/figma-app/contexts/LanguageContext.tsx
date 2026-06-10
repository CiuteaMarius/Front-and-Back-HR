import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Language, TranslationValues } from '../types';
import { translations } from '../utils/translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, values?: TranslationValues) => string;
  formatDate: (date: Date, options?: Intl.DateTimeFormatOptions) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);
const LANGUAGE_STORAGE_KEY = 'bilateralhr_language';
const defaultLanguage: Language = 'ro';

function storedLanguage(): Language {
  if (typeof window === 'undefined') return defaultLanguage;

  const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return value === 'en' || value === 'ro' || value === 'es' ? value : defaultLanguage;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(storedLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const t = (key: string, values?: TranslationValues): string => {
    const template = translations[key]?.[language] || translations[key]?.en || key;

    if (!values) return template;

    return Object.entries(values).reduce(
      (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
      template,
    );
  };

  const formatDate = (date: Date, options?: Intl.DateTimeFormatOptions): string => {
    if (Number.isNaN(date.getTime())) return '-';

    const locale = language === 'ro' ? 'ro-RO' : language === 'es' ? 'es-ES' : 'en-US';
    return new Intl.DateTimeFormat(locale, options ?? { dateStyle: 'medium' }).format(date);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, formatDate }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
