import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import Icon from './Icon';

/**
 * Confirmation shown after a public form is submitted (contact us, careers).
 *
 * Deliberately titleless: the tick, heading and button are the whole dialog, so it
 * reads as a receipt rather than as another panel of the form behind it.
 */
export default function SuccessDialog({ open, onClose, title, message, actionLabel }) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="px-2 py-6 text-center">
        <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <Icon name="check" size={32} />
        </span>

        <h2 className="mb-2 text-2xl font-extrabold text-ink-900">{title || t('success.thankYou')}</h2>
        <p className="mx-auto mb-6 max-w-xs text-sm leading-relaxed text-ink-500">{message}</p>

        <button type="button" onClick={onClose} className="btn-primary min-w-[120px]">
          {actionLabel || t('success.okay')}
        </button>
      </div>
    </Modal>
  );
}
