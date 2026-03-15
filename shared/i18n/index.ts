import { getLocales } from 'expo-localization';
import { translations } from './translations';

const SUPPORTED_LANGUAGES = Object.keys(translations);

function getDeviceLanguage(): string {
  try {
    const locales = getLocales();
    if (locales && locales.length > 0) {
      const langCode = locales[0].languageCode || 'en';
      if (SUPPORTED_LANGUAGES.includes(langCode)) {
        return langCode;
      }
    }
  } catch {}
  return 'en';
}

let currentLanguage = getDeviceLanguage();

export function t(key: string, params?: Record<string, string | number>): string {
  let text = translations[currentLanguage]?.[key] || translations['en']?.[key] || key;

  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    });
  }

  return text;
}

export function getSuitName(suit: string): string {
  return t(`suit.${suit}`);
}

export function getCurrentLanguage(): string {
  return currentLanguage;
}

export function setLanguage(lang: string): void {
  if (SUPPORTED_LANGUAGES.includes(lang)) {
    currentLanguage = lang;
  }
}

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES;
