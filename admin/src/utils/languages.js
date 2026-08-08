/**
 * The languages the storefront ships, for the translation editors.
 *
 * Mirrors client/src/i18n/languages.js and server/src/config/languages.js — adding
 * a language means adding it in all three. English is absent on purpose: it is the
 * base document, not a translation of it.
 */
export const TRANSLATABLE_LANGUAGES = [
  { code: 'hi', native: 'हिन्दी', english: 'Hindi' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada' },
  { code: 'mr', native: 'मराठी', english: 'Marathi' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati' },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam' },
  { code: 'pa', native: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { code: 'as', native: 'অসমীয়া', english: 'Assamese' },
];

/**
 * Drops empty strings and empty branches so a language the admin opened but never
 * filled is not stored as `{ hi: { name: '' } }` — which would otherwise read as
 * "translated to blank" and hide the English fallback.
 */
export function pruneTranslations(translations) {
  if (!translations) return undefined;

  const isEmpty = (v) =>
    v === undefined ||
    v === null ||
    (typeof v === 'string' && v.trim() === '') ||
    (Array.isArray(v) && v.every(isEmpty)) ||
    (typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(isEmpty));

  const clean = (value) => {
    if (Array.isArray(value)) {
      const list = value.map(clean);
      return list.every(isEmpty) ? undefined : list;
    }
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        const c = clean(v);
        if (!isEmpty(c)) out[k] = c;
      }
      return Object.keys(out).length ? out : undefined;
    }
    return typeof value === 'string' && value.trim() === '' ? undefined : value;
  };

  const out = {};
  for (const { code } of TRANSLATABLE_LANGUAGES) {
    const c = clean(translations[code]);
    if (c) out[code] = c;
  }
  return Object.keys(out).length ? out : undefined;
}
