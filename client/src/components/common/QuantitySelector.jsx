import { useTranslation } from 'react-i18next';
import Icon from './Icon';

export default function QuantitySelector({
  value = 1,
  min = 1,
  max = 10,
  onChange,
  disabled = false,
  size = 'md',
}) {
  const { t } = useTranslation();
  const clamp = (n) => Math.max(min, Math.min(max, n));

  const dims = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const text = size === 'sm' ? 'w-9 text-sm' : 'w-12 text-base';

  return (
    <div className="inline-flex items-center overflow-hidden rounded-lg border border-ink-300 bg-white">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        className={`${dims} grid place-items-center text-ink-600 transition hover:bg-ink-100
                    disabled:cursor-not-allowed disabled:text-ink-300`}
        aria-label={t('a11y.decrease')}
      >
        <Icon name="minus" size={14} />
      </button>

      <input
        type="number"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          // Allow a transient empty field while typing, but never commit NaN.
          const next = Number(e.target.value);
          if (!Number.isNaN(next) && e.target.value !== '') onChange(clamp(next));
        }}
        className={`${text} border-x border-ink-300 bg-white py-1.5 text-center font-semibold
                    text-ink-800 [appearance:textfield] focus:outline-none
                    [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
        aria-label={t('a11y.quantity')}
      />

      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        className={`${dims} grid place-items-center text-ink-600 transition hover:bg-ink-100
                    disabled:cursor-not-allowed disabled:text-ink-300`}
        aria-label={t('a11y.increase')}
      >
        <Icon name="plus" size={14} />
      </button>
    </div>
  );
}
