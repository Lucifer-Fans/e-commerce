import { useTranslation } from 'react-i18next';

export default function Spinner({ size = 20, className = '' }) {
  const { t } = useTranslation();

  return (
    <span
      role="status"
      aria-label={t('a11y.loading')}
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

/** Full-page loader used as the Suspense fallback while a route chunk downloads. */
export function PageLoader({ label }) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-ink-400">
      <Spinner size={34} className="text-brand-600" />
      <p className="text-sm font-medium">{label || t('actions.loading')}</p>
    </div>
  );
}
