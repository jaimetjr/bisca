/**
 * The Play Console listings, and which in-app language each one renders in.
 *
 * Play treats every row here as a separate store listing with its own name,
 * descriptions, screenshots and feature graphic — so each gets its own asset
 * folder, named exactly as the listing is. That keeps uploads unambiguous:
 * one folder, one listing.
 *
 * `lang` is the key in `shared/i18n/translations.ts` used to render the assets.
 * Portuguese is the case that matters: pt-BR and pt-PT are two listings with
 * genuinely different store copy (Brazilian vs European Portuguese), but the app
 * itself ships a single `pt` translation, so both render from it. Their assets
 * are therefore identical today — give the app separate pt-BR/pt-PT strings if
 * you want them to differ visually too.
 */
export const STORE_LOCALES = [
  // pt-BR and pt-PT render from the same `pt` strings, which makes their
  // screenshots byte-identical — Play then stores one asset and reports
  // "asset was deduplicated" on the second upload. Giving them different card
  // backs makes the pixels genuinely differ on every shot that shows a card.
  // The home screen has no card on it, so that one still matches; the real cure
  // is separate pt-PT strings (see the note below).
  { store: 'pt-BR', lang: 'pt', label: 'Português (Brasil)', cardBack: 'vermelho' },
  { store: 'pt-PT', lang: 'pt', label: 'Português (Portugal)', cardBack: 'verde' },
  { store: 'it-IT', lang: 'it', label: 'Italiano' },
  { store: 'es-ES', lang: 'es', label: 'Español' },
  { store: 'en-US', lang: 'en', label: 'English' },
  { store: 'fr-FR', lang: 'fr', label: 'Français' },
  { store: 'de-DE', lang: 'de', label: 'Deutsch' },
  { store: 'nl-NL', lang: 'nl', label: 'Nederlands' },
  { store: 'ru-RU', lang: 'ru', label: 'Русский' },
  { store: 'ja-JP', lang: 'ja', label: '日本語' },
  { store: 'zh-CN', lang: 'zh', label: '简体中文' },
  { store: 'ko-KR', lang: 'ko', label: '한국어' },
  { store: 'ar', lang: 'ar', label: 'العربية' },
];

/** Resolves a `--locales` argument to rows, accepting store codes or languages. */
export function selectLocales(arg) {
  if (!arg || !arg.trim()) return STORE_LOCALES;
  const wanted = arg.split(',').map((s) => s.trim()).filter(Boolean);
  const rows = [];
  for (const w of wanted) {
    const hits = STORE_LOCALES.filter((l) => l.store === w || l.lang === w);
    if (!hits.length) throw new Error(`unknown locale: ${w}`);
    rows.push(...hits);
  }
  return rows;
}
