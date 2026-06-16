import { getLocales } from 'expo-localization';

export type DateFormat = 'DMY' | 'MDY' | 'YMD';

export function getLocaleDateFormat(): DateFormat {
  try {
    const locale = getLocales()?.[0];
    const lang = locale?.languageCode ?? 'en';
    const region = locale?.regionCode ?? '';

    if (lang === 'ja' || lang === 'zh' || lang === 'ko') return 'YMD';
    // en uses MDY in US/PH; en-CA, en-GB, en-AU, etc. use DMY
    if (lang === 'en' && (region === 'US' || region === 'PH')) return 'MDY';
    return 'DMY';
  } catch {
    return 'DMY';
  }
}

export function getLocaleDatePlaceholder(): string {
  const fmt = getLocaleDateFormat();
  if (fmt === 'MDY') return 'MM/DD/YYYY';
  if (fmt === 'YMD') return 'YYYY/MM/DD';
  return 'DD/MM/YYYY';
}

/** Auto-format raw digits into the locale date layout with slashes. */
export function formatLocaleDate(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const fmt = getLocaleDateFormat();
  if (fmt === 'YMD') {
    if (digits.length <= 4) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 4)}/${digits.slice(4)}`;
    return `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`;
  }
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function parseLocaleDate(input: string): { day: number; month: number; year: number } | null {
  const parts = input.split('/');
  if (parts.length !== 3) return null;
  const fmt = getLocaleDateFormat();
  let day: number, month: number, year: number;
  if (fmt === 'MDY') {
    [month, day, year] = parts.map(Number);
  } else if (fmt === 'YMD') {
    [year, month, day] = parts.map(Number);
  } else {
    [day, month, year] = parts.map(Number);
  }
  if (!day || !month || !year || year < 1900) return null;
  return { day, month, year };
}

/** True if the locale-formatted date represents someone at least 18 years old today. */
export function isAtLeast18(dobString: string): boolean {
  const parsed = parseLocaleDate(dobString);
  if (!parsed) return false;
  const { day, month, year } = parsed;
  const dob = new Date(year, month - 1, day);
  if (isNaN(dob.getTime()) || dob.getDate() !== day || dob.getMonth() !== month - 1) return false;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 18;
}

/** Convert a locale-formatted date to YYYY-MM-DD for the server. */
export function dobToISO(dobString: string): string {
  const parsed = parseLocaleDate(dobString);
  if (!parsed) return dobString;
  const { day, month, year } = parsed;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Convert YYYY-MM-DD into the user's locale date layout for display. */
export function isoToLocaleDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  const fmt = getLocaleDateFormat();
  if (fmt === 'MDY') return `${m}/${d}/${y}`;
  if (fmt === 'YMD') return `${y}/${m}/${d}`;
  return `${d}/${m}/${y}`;
}
