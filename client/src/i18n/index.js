import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { LANGUAGE_CODES, FALLBACK_LANGUAGE, getLanguage, resolveLanguage } from './languages';
// The English shell namespace is the one bundle that is never allowed to be
// missing: it is the fallback for every other language, and it backs the header,
// footer and error screens that render before any route resolves. Bundling it
// statically makes `t()` synchronous from the very first frame — everything else
// is still fetched on demand below.
import enCommon from './locales/en/common.json';

/**
 * Translation bundles are split by namespace *and* language, then loaded on demand.
 * `import.meta.glob` hands Vite a static map at build time, so every JSON file
 * becomes its own chunk — a Hindi shopper never downloads the Tamil checkout copy,
 * and a visitor who never opens Checkout never downloads that namespace at all.
 */
const loaders = import.meta.glob('./locales/*/*.json');
// Vite warns that en/common.json is both statically and dynamically imported.
// That is expected and harmless: it is listed in `resources` below, so i18next
// never asks the backend for it — the glob entry simply goes unused.

export const STORAGE_KEY = 'app.language';

/** Loaded up front — the shell (header, footer, toasts, errors) is never not on screen. */
export const PRELOAD_NAMESPACES = ['common'];

/**
 * Resolves the starting language. The order is explicit rather than delegated to
 * i18next-browser-languagedetector so it can be reasoned about and tested:
 *
 *   ?lang= → saved choice → browser languages → English
 *
 * `?lang=` wins because it is what the hreflang alternates in <Seo> point at —
 * a visitor arriving from a Tamil search result must land in Tamil, whatever
 * their browser or a previous visit said.
 */
export function detectInitialLanguage() {
  const fromQuery = resolveLanguage(
    new URLSearchParams(window.location.search).get('lang')
  );
  if (fromQuery) return { language: fromQuery, source: 'query' };

  try {
    const saved = resolveLanguage(localStorage.getItem(STORAGE_KEY));
    if (saved) return { language: saved, source: 'stored' };
  } catch {
    // Private mode / storage disabled — detection still works, persistence doesn't.
  }

  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    const match = resolveLanguage(tag);
    if (match) return { language: match, source: 'browser' };
  }

  return { language: FALLBACK_LANGUAGE, source: 'fallback' };
}

const { language: initialLanguage, source: initialSource } = detectInitialLanguage();

/** How the first language was picked — the one-time welcome dialog keys off this. */
export const initialDetection = initialSource;

i18n
  .use(
    resourcesToBackend((language, namespace) => {
      const load = loaders[`./locales/${language}/${namespace}.json`];
      // A namespace a language hasn't translated yet is not an error: resolve empty
      // and let i18next's fallbackLng fill every key from English.
      return load ? load() : Promise.resolve({ default: {} });
    })
  )
  .use(initReactI18next)
  .init({
    lng: initialLanguage,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: LANGUAGE_CODES,
    resources: { [FALLBACK_LANGUAGE]: { common: enCommon } },
    // …but keep asking the backend for everything that isn't in `resources`.
    partialBundledLanguages: true,
    // Codes here are already narrowed by resolveLanguage, so no extra cleaning.
    load: 'currentOnly',
    ns: PRELOAD_NAMESPACES,
    defaultNS: 'common',
    fallbackNS: 'common',
    // A key present but empty in a translation should still fall through to English.
    returnEmptyString: false,
    interpolation: {
      // React escapes for us; double-escaping mangles names and product titles.
      escapeValue: false,
    },
    react: {
      // Route-level <Suspense> already renders skeletons, so let namespaces suspend.
      useSuspense: true,
    },
    // Silence the "missing key" console noise in production only.
    debug: false,
  });

/**
 * Mirrors the active language onto <html> for screen readers, hyphenation and SEO,
 * and keeps Intl-based formatting (dates, currency) on the same locale.
 */
export function applyDocumentLanguage(code) {
  const language = getLanguage(code);
  document.documentElement.lang = language.code;
  document.documentElement.dir = language.dir;
}

applyDocumentLanguage(i18n.language);
i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
