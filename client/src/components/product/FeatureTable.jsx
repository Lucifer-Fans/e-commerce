import { useTranslation } from 'react-i18next';
import EmptyState from '../common/EmptyState';

/**
 * Renders the admin's key/value feature pairs as a specification table.
 * The rows are whatever the admin entered in step 2 of the upload wizard — the
 * storefront never assumes a fixed set of attributes.
 */
export default function FeatureTable({ features = [], columns = 2 }) {
  const { t } = useTranslation('shop');

  if (!features.length) {
    return (
      <EmptyState icon="info" title={t('specs.emptyTitle')} message={t('specs.emptyMessage')} />
    );
  }

  const sorted = [...features].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  return (
    <div className={`grid gap-x-10 ${columns === 2 ? 'md:grid-cols-2' : ''}`}>
      {sorted.map((feature, index) => (
        <dl
          key={`${feature.key}-${index}`}
          className="flex border-b border-ink-100 py-3 last:border-0 md:last:border-b"
        >
          <dt className="w-2/5 shrink-0 text-sm font-medium text-ink-500">{feature.key}</dt>
          <dd className="flex-1 text-sm font-semibold text-ink-800">{feature.value}</dd>
        </dl>
      ))}
    </div>
  );
}
