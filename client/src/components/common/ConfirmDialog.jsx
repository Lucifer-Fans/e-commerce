import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal';
import Spinner from './Spinner';

/**
 * Confirmation gate for destructive actions (remove item, cancel order, delete address).
 * Callers pass already-translated copy; the defaults below cover the generic case.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
}) {
  const { t } = useTranslation();
  const [working, setWorking] = useState(false);

  const confirm = async () => {
    setWorking(true);
    try {
      await onConfirm?.();
      onClose?.();
    } finally {
      setWorking(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={working ? () => {} : onClose}
      title={title || t('confirm.title')}
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} disabled={working} className="btn-outline">
            {cancelLabel || t('actions.cancel')}
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={working}
            className={danger ? 'btn-danger' : 'btn-primary'}
          >
            {working && <Spinner size={14} />}
            {confirmLabel || t('actions.confirm')}
          </button>
        </>
      }
    >
      <p className="text-sm text-ink-600">{message || t('confirm.message')}</p>
    </Modal>
  );
}
