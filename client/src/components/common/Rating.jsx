import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import { formatNumber } from '../../utils/format';

/** Star rating. Renders partial stars via a clipped overlay, so 4.3 looks like 4.3. */
export default function Rating({ value = 0, count, size = 14, showValue = true, className = '' }) {
  const { t } = useTranslation();
  const rounded = Math.round(Number(value) * 10) / 10;
  const percent = Math.max(0, Math.min(100, (rounded / 5) * 100));

  return (
    <div
      className={`flex items-center gap-1.5 ${className}`}
      aria-label={t('a11y.rated', { value: rounded })}
    >
      <div className="relative inline-flex">
        <div className="flex text-ink-300">
          {[0, 1, 2, 3, 4].map((i) => (
            <Icon key={i} name="star" size={size} filled strokeWidth={0} />
          ))}
        </div>
        <div
          className="absolute inset-0 flex overflow-hidden text-amber-400"
          style={{ width: `${percent}%` }}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <Icon key={i} name="star" size={size} filled strokeWidth={0} className="shrink-0" />
          ))}
        </div>
      </div>

      {showValue && rounded > 0 && (
        <span className="text-xs font-semibold text-ink-700">{rounded.toFixed(1)}</span>
      )}
      {count !== undefined && (
        <span className="text-xs text-ink-400">({formatNumber(count)})</span>
      )}
    </div>
  );
}
