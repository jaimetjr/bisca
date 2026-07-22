import { describe, it, expect } from 'vitest';
import { translations } from '../../shared/i18n/translations';

const LOCALES = Object.keys(translations);
const NON_ENGLISH_LOCALES = LOCALES.filter(l => l !== 'en');
const enKeys = Object.keys(translations.en);
const tutorialKeys = enKeys.filter(k => k.startsWith('tutorial.'));

describe('translation key parity', () => {
  it('defines every English key in every locale', () => {
    for (const locale of NON_ENGLISH_LOCALES) {
      const missing = enKeys.filter(k => !translations[locale][k]);
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([]);
    }
  });

  it('has no keys outside the English set (catches typos)', () => {
    for (const locale of NON_ENGLISH_LOCALES) {
      const extra = Object.keys(translations[locale]).filter(k => !enKeys.includes(k));
      expect(extra, `${locale} has unknown keys: ${extra.join(', ')}`).toEqual([]);
    }
  });

  it('keeps every {{placeholder}} from the English value in every locale', () => {
    for (const key of enKeys) {
      const placeholders = translations.en[key].match(/\{\{\w+\}\}/g) ?? [];
      for (const locale of NON_ENGLISH_LOCALES) {
        for (const ph of placeholders) {
          expect(
            translations[locale][key],
            `${locale} ${key} is missing placeholder ${ph}`,
          ).toContain(ph);
        }
      }
    }
  });
});

describe('tutorial translations', () => {
  it('has tutorial keys in the English locale', () => {
    expect(tutorialKeys.length).toBeGreaterThan(0);
  });

  it('defines every tutorial key in every locale', () => {
    for (const locale of LOCALES) {
      for (const key of tutorialKeys) {
        expect(translations[locale][key], `${locale} is missing ${key}`).toBeTruthy();
      }
    }
  });

  it('actually translates long tutorial text (no English copy-paste)', () => {
    const longKeys = tutorialKeys.filter(k => translations.en[k].length > 40);
    for (const locale of NON_ENGLISH_LOCALES) {
      for (const key of longKeys) {
        expect(translations[locale][key], `${locale} ${key} is identical to English`).not.toBe(translations.en[key]);
      }
    }
  });

  it('keeps the {{points}} placeholder in every locale', () => {
    for (const locale of LOCALES) {
      expect(translations[locale]['tutorial.points']).toContain('{{points}}');
    }
  });
});
