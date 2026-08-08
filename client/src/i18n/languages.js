/**
 * The single source of truth for every language the storefront speaks.
 *
 * Adding a language is a two-step job and nothing else:
 *   1. Add an entry here.
 *   2. Drop `src/i18n/locales/<code>/{common,shop,checkout,account}.json` in place.
 * The selector, the detector, the <html lang>/hreflang tags and the server-side
 * enum all read from this list, so nothing else needs touching.
 *
 * `landmark` names an illustration in components/language/LandmarkArt.jsx — a
 * missing one degrades to a neutral mark rather than breaking the card.
 */
export const LANGUAGES = [
  {
    code: 'en',
    native: 'English',
    english: 'English',
    locale: 'en-IN',
    dir: 'ltr',
    landmark: 'globe',
    region: 'Default',
  },
  {
    code: 'hi',
    native: 'हिन्दी',
    english: 'Hindi',
    locale: 'hi-IN',
    dir: 'ltr',
    landmark: 'tajMahal',
    region: 'Uttar Pradesh',
  },
  {
    code: 'ta',
    native: 'தமிழ்',
    english: 'Tamil',
    locale: 'ta-IN',
    dir: 'ltr',
    landmark: 'gopuram',
    region: 'Tamil Nadu',
  },
  {
    code: 'te',
    native: 'తెలుగు',
    english: 'Telugu',
    locale: 'te-IN',
    dir: 'ltr',
    landmark: 'charminar',
    region: 'Telangana',
  },
  {
    code: 'kn',
    native: 'ಕನ್ನಡ',
    english: 'Kannada',
    locale: 'kn-IN',
    dir: 'ltr',
    landmark: 'mysorePalace',
    region: 'Karnataka',
  },
  {
    code: 'mr',
    native: 'मराठी',
    english: 'Marathi',
    locale: 'mr-IN',
    dir: 'ltr',
    landmark: 'gatewayOfIndia',
    region: 'Maharashtra',
  },
  {
    code: 'bn',
    native: 'বাংলা',
    english: 'Bengali',
    locale: 'bn-IN',
    dir: 'ltr',
    landmark: 'howrahBridge',
    region: 'West Bengal',
  },
  {
    code: 'gu',
    native: 'ગુજરાતી',
    english: 'Gujarati',
    locale: 'gu-IN',
    dir: 'ltr',
    landmark: 'statueOfUnity',
    region: 'Gujarat',
  },
  {
    code: 'or',
    native: 'ଓଡ଼ିଆ',
    english: 'Odia',
    locale: 'or-IN',
    dir: 'ltr',
    landmark: 'konarkWheel',
    region: 'Odisha',
  },
  {
    code: 'ml',
    native: 'മലയാളം',
    english: 'Malayalam',
    locale: 'ml-IN',
    dir: 'ltr',
    landmark: 'houseboat',
    region: 'Kerala',
  },
  {
    code: 'pa',
    native: 'ਪੰਜਾਬੀ',
    english: 'Punjabi',
    locale: 'pa-IN',
    dir: 'ltr',
    landmark: 'goldenTemple',
    region: 'Punjab',
  },
  {
    code: 'as',
    native: 'অসমীয়া',
    english: 'Assamese',
    locale: 'as-IN',
    dir: 'ltr',
    landmark: 'rhino',
    region: 'Assam',
  },
];

/** English is the fallback everywhere — it is the only language guaranteed complete. */
export const FALLBACK_LANGUAGE = 'en';

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.code);

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export const isSupported = (code) => BY_CODE.has(code);

/** Always returns a language object — falls back to English rather than undefined. */
export const getLanguage = (code) => BY_CODE.get(code) || BY_CODE.get(FALLBACK_LANGUAGE);

/**
 * Narrows a BCP-47 tag to a code we actually ship: `ta-IN` → `ta`, `en-GB` → `en`.
 * Returns null when nothing matches so callers can decide their own fallback.
 */
export const resolveLanguage = (tag) => {
  if (!tag) return null;
  const normalised = String(tag).toLowerCase().replace('_', '-');
  if (BY_CODE.has(normalised)) return normalised;
  const base = normalised.split('-')[0];
  return BY_CODE.has(base) ? base : null;
};
