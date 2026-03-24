import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setLanguage, getCurrentLanguage } from '../i18n';

interface Ctx {
  language: string;
  changeLanguage: (code: string) => void;
}

const SETTINGS_KEY = '@bisca:settings';

const LanguageContext = createContext<Ctx>({ language: 'en', changeLanguage: () => {} });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState(getCurrentLanguage);

  // Sync with persisted settings on startup so the saved language is applied immediately
  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const { language: saved } = JSON.parse(raw) as { language?: string };
        if (saved && saved !== getCurrentLanguage()) {
          setLanguage(saved);
          setLang(saved);
        }
      } catch {}
    });
  }, []);

  const changeLanguage = useCallback((code: string) => {
    setLanguage(code);
    setLang(code);
  }, []);

  return (
    <LanguageContext.Provider value={{ language, changeLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
