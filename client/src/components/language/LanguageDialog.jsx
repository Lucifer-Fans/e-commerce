import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import LanguageCard from './LanguageCard';
import useLanguage from '../../i18n/useLanguage';

/**
 * The language picker itself — a centred modal on desktop, a bottom sheet on
 * mobile, both inherited from the shared <Modal> so it behaves like every other
 * dialog on the site.
 */
export default function LanguageDialog({ open, onClose, title, description }) {
  const { t } = useTranslation();
  const { language, languages, changeLanguage, switching } = useLanguage();

  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(null);
  const groupRef = useRef(null);
  const restoreFocusTo = useRef(null);

  // Reset between openings so the list never re-opens mid-search.
  useEffect(() => {
    if (open) {
      setQuery('');
      setPending(null);
    }
  }, [open]);

  /**
   * Send focus into the dialog on open and hand it back to whatever opened it on
   * close — the shared Modal handles Escape and scroll locking but not this.
   */
  useEffect(() => {
    if (!open) return undefined;
    restoreFocusTo.current = document.activeElement;

    const frame = requestAnimationFrame(() => {
      const checked = groupRef.current?.querySelector('input[type="radio"]:checked');
      (checked || groupRef.current?.querySelector('input[type="radio"]'))?.focus();
    });

    return () => {
      cancelAnimationFrame(frame);
      restoreFocusTo.current?.focus?.();
    };
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return languages;
    return languages.filter(
      (l) =>
        l.english.toLowerCase().includes(q) ||
        l.native.toLowerCase().includes(q) ||
        l.code.includes(q)
    );
  }, [languages, query]);

  const select = async (code) => {
    if (code === language) return onClose?.();
    setPending(code);
    try {
      await changeLanguage(code);
      onClose?.();
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title || t('language.chooseTitle')} size="lg">
      <p className="mb-4 text-sm text-ink-500">{description || t('language.chooseSubtitle')}</p>

      {/* Worth its place at twelve languages, and keeps the list usable at thirty. */}
      <div className="relative mb-4">
        <Icon
          name="search"
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="input pl-9"
          placeholder={t('language.searchPlaceholder')}
          aria-label={t('language.searchPlaceholder')}
        />
      </div>

      {results.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-500">{t('language.noMatch', { query })}</p>
      ) : (
        <div
          ref={groupRef}
          role="radiogroup"
          aria-label={t('language.chooseTitle')}
          className="grid gap-3 sm:grid-cols-2"
        >
          {results.map((item) => (
            <LanguageCard
              key={item.code}
              name="app-language"
              language={item}
              selected={item.code === language}
              busy={Boolean(pending) && pending !== item.code}
              onSelect={select}
            />
          ))}
        </div>
      )}

      {/* Live region: the switch is instant, but it needs announcing either way. */}
      <p aria-live="polite" className="sr-only">
        {switching ? t('language.applying') : ''}
      </p>

      {pending && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-ink-500">
          <Spinner size={14} />
          {t('language.applying')}
        </p>
      )}
    </Modal>
  );
}
