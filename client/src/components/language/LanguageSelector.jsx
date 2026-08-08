import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Icon from '../common/Icon';
import LandmarkArt from './LandmarkArt';
import LanguageDialog from './LanguageDialog';
import useLanguage from '../../i18n/useLanguage';

/**
 * The entry point shown in My Account → Settings: a row that states the current
 * language and opens the picker. Built from the same border/hover/radius tokens as
 * the account nav links so it sits in the settings card without announcing itself
 * as a bolted-on feature.
 */
export default function LanguageSelector({ className = '' }) {
  const { t } = useTranslation();
  const { current } = useLanguage();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl border border-ink-200 bg-white p-3.5 text-left
                    transition-all duration-200 hover:border-brand-300 hover:shadow-card active:scale-[.99] ${className}`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon name="globe" size={20} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink-900">{current.native}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-500">
            {current.english} · {t('language.tapToChange')}
          </span>
        </span>

        <LandmarkArt name={current.landmark} className="hidden h-9 w-14 text-ink-300 sm:block" />
        <Icon name="chevronRight" size={18} className="shrink-0 text-ink-400" />
      </button>

      <LanguageDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
