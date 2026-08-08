import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { userApi } from '../api/endpoints';
import { setUser } from '../store/authSlice';
import { fetchCategories } from '../store/catalogSlice';
import { fetchCart } from '../store/cartSlice';
import { fetchWishlist } from '../store/wishlistSlice';
import { STORAGE_KEY, initialDetection } from './index';
import { LANGUAGES, FALLBACK_LANGUAGE, getLanguage, resolveLanguage } from './languages';
import LanguageContext from './LanguageContext';

/** localStorage throws in some privacy modes; a lost preference must not break the app. */
const remember = (code) => {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    /* preference is session-only this time */
  }
};

/**
 * Owns everything about *which* language is active — i18next holds the strings,
 * this holds the policy:
 *
 *   • a signed-in user's saved language wins on session restore (device sync);
 *   • a change made while signed in is pushed to the account;
 *   • a change made signed-out is remembered locally and adopted on next login
 *     if the account has no preference of its own;
 *   • a first-time visitor gets their browser language, English if unmatched.
 */
export default function LanguageProvider({ children }) {
  const { i18n } = useTranslation();
  const dispatch = useDispatch();
  const { user, isAuthenticated, initialising } = useSelector((s) => s.auth);

  const [language, setLanguage] = useState(() => resolveLanguage(i18n.language) || FALLBACK_LANGUAGE);
  const [switching, setSwitching] = useState(false);

  // The welcome prompt is a one-time affordance for genuinely new visitors — never
  // for someone who already made a choice, and never twice.
  const [welcomeOpen, setWelcomeOpen] = useState(false);

  // Guards the login sync so it runs once per session rather than on every
  // `user` object replacement (avatar upload, profile edit, realtime push).
  const syncedForUser = useRef(null);

  // Keep local state in step with changes made outside this provider.
  useEffect(() => {
    const onChange = (code) => setLanguage(resolveLanguage(code) || FALLBACK_LANGUAGE);
    i18n.on('languageChanged', onChange);
    return () => i18n.off('languageChanged', onChange);
  }, [i18n]);

  /**
   * Switches the interface. Awaiting `changeLanguage` means the new bundles are in
   * place before anything re-renders, so no component flashes an untranslated key.
   */
  const changeLanguage = useCallback(
    async (code, { persist = true } = {}) => {
      const next = resolveLanguage(code) || FALLBACK_LANGUAGE;
      if (next === i18n.language && !switching) {
        if (persist) remember(next);
        return next;
      }

      setSwitching(true);
      try {
        await i18n.changeLanguage(next);
        if (persist) remember(next);

        // The switch itself is already done and stored locally, so a failed sync
        // never blocks it — but it is not silent either. Swallowing this is what
        // let a server-side write failure look like "the language keeps resetting"
        // instead of "saving to your account failed".
        if (persist && isAuthenticated) {
          userApi
            .updateLanguage(next)
            .then((res) => res?.data?.user && dispatch(setUser(res.data.user)))
            .catch(() => toast.error(i18n.t('language.syncFailed')));
        }
        return next;
      } finally {
        setSwitching(false);
      }
    },
    [i18n, isAuthenticated, dispatch, switching]
  );

  // --- Account sync ------------------------------------------------------
  useEffect(() => {
    if (initialising) return;

    if (!isAuthenticated || !user) {
      syncedForUser.current = null;
      return;
    }
    if (syncedForUser.current === user.id || syncedForUser.current === user._id) return;
    syncedForUser.current = user.id || user._id;

    const saved = resolveLanguage(user.preferredLanguage);
    if (saved && saved !== i18n.language) {
      // The account's choice is authoritative — this is the cross-device sync.
      changeLanguage(saved, { persist: false }).then(() => remember(saved));
    } else if (!saved && i18n.language !== FALLBACK_LANGUAGE) {
      // Account has no preference yet; adopt the one they were already using.
      // Quiet on failure — the visitor did not ask for anything here.
      userApi.updateLanguage(i18n.language).catch(() => {});
    }
  }, [initialising, isAuthenticated, user, i18n, changeLanguage]);

  // A visitor who arrived on ?lang=ta has chosen Tamil as surely as if they had
  // clicked it, so make it stick beyond this page view.
  useEffect(() => {
    if (initialDetection === 'query') remember(i18n.language);
  }, [i18n.language]);

  /*
   * Catalogue copy is translated server-side, so everything already fetched is
   * stale the moment the language changes. `useFetch` re-runs itself; these three
   * live in Redux and have to be told. Skipped on the first render — they are
   * already being loaded by App's own boot effect.
   */
  const loadedFor = useRef(i18n.language);
  useEffect(() => {
    if (loadedFor.current === i18n.language) return;
    loadedFor.current = i18n.language;

    dispatch(fetchCategories());
    if (isAuthenticated) {
      dispatch(fetchCart());
      dispatch(fetchWishlist());
    }
  }, [i18n.language, isAuthenticated, dispatch]);

  // --- One-time welcome prompt -------------------------------------------
  useEffect(() => {
    if (initialising || isAuthenticated) return;
    // Only when we had to guess. A stored choice — or an explicit ?lang= — means
    // the visitor has already decided, so asking again would be noise.
    if (initialDetection === 'stored' || initialDetection === 'query') return;
    try {
      if (localStorage.getItem(`${STORAGE_KEY}.prompted`)) return;
    } catch {
      return; // no storage means we cannot honour "one-time"; better to stay quiet
    }
    setWelcomeOpen(true);
  }, [initialising, isAuthenticated]);

  const dismissWelcome = useCallback(() => {
    setWelcomeOpen(false);
    try {
      localStorage.setItem(`${STORAGE_KEY}.prompted`, '1');
    } catch {
      /* nothing to do — the prompt simply may reappear */
    }
  }, []);

  const value = useMemo(
    () => ({
      language,
      current: getLanguage(language),
      languages: LANGUAGES,
      changeLanguage,
      switching,
      welcomeOpen,
      dismissWelcome,
      // What the browser suggested, so the welcome dialog can highlight it.
      suggested: initialDetection === 'browser' ? language : null,
    }),
    [language, changeLanguage, switching, welcomeOpen, dismissWelcome]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
