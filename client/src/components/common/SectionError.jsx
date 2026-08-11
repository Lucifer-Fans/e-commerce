import { useTranslation } from 'react-i18next';
import Icon from './Icon';

/**
 * The failure state for one band of a page, where <ErrorState> would be too much.
 *
 * <ErrorState> owns the middle of a screen — it is what a product grid or an order
 * list becomes when it cannot load, and it is sized to be the only thing there. A
 * home page is a stack of independent bands, any one of which can fail on its own,
 * and three of those blocks in a column reads as a broken site rather than as a
 * hero that needs one more try.
 *
 * So this keeps a failed band roughly the height it would have occupied, says which
 * band it was, and offers the same retry. Same tokens, quieter voice.
 */
export default function SectionError({ title, message, onRetry, className = '' }) {
  const { t } = useTranslation();

  return (
    <div className={`container-page ${className}`}>
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-ink-200 bg-white px-5 py-6 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-danger">
            <Icon name="alert" size={18} />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-900">{title || t('errors.generic')}</p>
            <p className="mt-0.5 text-sm text-ink-500">{message || t('errors.loadFailed')}</p>
          </div>
        </div>

        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-outline shrink-0 !px-4 !py-2">
            <Icon name="refresh" size={15} />
            {t('actions.retry')}
          </button>
        )}
      </div>
    </div>
  );
}
