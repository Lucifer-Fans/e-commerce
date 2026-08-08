import { useTranslation } from 'react-i18next';
import Icon from './Icon';

/** Windowed page list with ellipses — never renders more than ~7 buttons. */
function pageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

export default function Pagination({ page = 1, totalPages = 1, onChange, className = '' }) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const go = (target) => {
    if (target < 1 || target > totalPages || target === page) return;
    onChange(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav
      aria-label={t('a11y.pagination')}
      className={`flex items-center justify-center gap-1.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => go(page - 1)}
        disabled={page === 1}
        className="btn-outline h-9 w-9 !px-0"
        aria-label={t('a11y.previousPage')}
      >
        <Icon name="chevronLeft" size={16} />
      </button>

      {pageWindow(page, totalPages).map((item, index) =>
        item === '…' ? (
          <span key={`gap-${index}`} className="px-2 text-ink-400">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => go(item)}
            aria-current={item === page ? 'page' : undefined}
            aria-label={t('a11y.goToPage', { page: item })}
            className={`h-9 min-w-9 rounded-lg px-3 text-sm font-semibold transition ${
              item === page
                ? 'bg-brand-600 text-white shadow-sm'
                : 'border border-ink-300 bg-white text-ink-700 hover:border-brand-500 hover:text-brand-600'
            }`}
          >
            {item}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => go(page + 1)}
        disabled={page === totalPages}
        className="btn-outline h-9 w-9 !px-0"
        aria-label={t('a11y.nextPage')}
      >
        <Icon name="chevronRight" size={16} />
      </button>
    </nav>
  );
}
