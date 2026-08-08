import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const { t } = useTranslation();

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    // Stop the page behind the overlay from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 animate-fade-in bg-ink-900/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : t('a11y.dialog')}
        className={`relative z-10 max-h-[92vh] w-full animate-slide-up overflow-hidden rounded-t-2xl
                    bg-white shadow-2xl sm:rounded-2xl ${SIZES[size]}`}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-ink-200 px-5 py-4">
            <h2 className="text-base font-bold text-ink-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              aria-label={t('a11y.closeDialog')}
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex justify-end gap-3 border-t border-ink-200 bg-ink-50 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
