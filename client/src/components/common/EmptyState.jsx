import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

/** Consistent "nothing here" panel — always offers a next action. */
export default function EmptyState({
  icon = 'emptyBox',
  title,
  message,
  actionLabel,
  actionTo,
  onAction,
  className = '',
}) {
  const { t } = useTranslation();

  return (
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}>
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-ink-100 text-ink-400">
        <Icon name={icon} size={36} />
      </div>
      <h3 className="mb-1.5 text-lg font-bold text-ink-900">{title || t('empty.nothingHere')}</h3>
      {message && <p className="mb-6 max-w-md text-sm text-ink-500">{message}</p>}

      {actionLabel && actionTo && (
        <Link to={actionTo} className="btn-primary">
          {actionLabel}
        </Link>
      )}
      {actionLabel && onAction && !actionTo && (
        <button type="button" onClick={onAction} className="btn-primary">
          {actionLabel}
        </button>
      )}
    </div>
  );
}
