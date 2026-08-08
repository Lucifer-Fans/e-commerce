import { useTranslation } from 'react-i18next';
import Icon from './Icon';

export default function ErrorState({ title, message, onRetry, className = '' }) {
  const { t } = useTranslation();

  return (
    <div className={`flex flex-col items-center justify-center px-6 py-16 text-center ${className}`}>
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-danger">
        <Icon name="alert" size={36} />
      </div>
      <h3 className="mb-1.5 text-lg font-bold text-ink-900">{title || t('errors.generic')}</h3>
      <p className="mb-6 max-w-md text-sm text-ink-500">{message || t('errors.loadFailed')}</p>

      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline">
          <Icon name="refresh" size={16} />
          {t('actions.retry')}
        </button>
      )}
    </div>
  );
}
