import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import useScrollLock from '../../hooks/useScrollLock';
import useMediaQuery from '../../hooks/useMediaQuery';
import Icon from './Icon';

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** Slide-up / slide-down timing for `sheet` dialogs. */
const SHEET_DURATION = 320;
const SHEET_EASING = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
/** Above this width a `sheet` dialog is just the usual centred dialog. */
const WIDE = '(min-width: 640px)';

/**
 * `sheet` opts a dialog into the bottom-sheet treatment on handheld widths: it
 * slides up from the bottom edge and slides back down on close instead of
 * appearing in place. It is opt-in so existing dialogs are untouched — only the
 * cancellation-reason dialog asks for it today.
 */
export default function Modal({ open, onClose, title, children, footer, size = 'md', sheet = false }) {
  const { t } = useTranslation();
  const isWide = useMediaQuery(WIDE);
  const asSheet = sheet && !isWide;

  // Sheets stay mounted through their closing animation; everything else keeps
  // unmounting the instant `open` goes false, exactly as before.
  const [mounted, setMounted] = useState(open);
  // Starts at 'enter' so a dialog that mounts already open still starts from
  // below the fold rather than flashing in place for a frame.
  const [phase, setPhase] = useState(open ? 'enter' : 'closed');

  useEffect(() => {
    if (open) {
      setMounted(true);
      setPhase('enter');
    } else {
      setPhase((current) => (current === 'closed' ? current : 'leave'));
    }
  }, [open]);

  // Mount off-screen, then release on the next frame so the browser has a start
  // position to animate away from.
  useEffect(() => {
    if (phase !== 'enter') return undefined;

    const frame = requestAnimationFrame(() => setPhase('open'));

    return () => cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'leave') return undefined;

    const timer = setTimeout(
      () => {
        setMounted(false);
        setPhase('closed');
      },
      asSheet ? SHEET_DURATION : 0
    );

    return () => clearTimeout(timer);
  }, [phase, asSheet]);

  const active = asSheet ? open || mounted : open;
  // Freezes the page behind the dialog, on touch as well as desktop.
  const overlayRef = useScrollLock(active);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!active) return null;

  const sheetStyle = asSheet
    ? {
        transform: `translate3d(0, ${phase === 'open' ? '0' : '100%'}, 0)`,
        transition: `transform ${SHEET_DURATION}ms ${SHEET_EASING}`,
      }
    : undefined;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
    >
      <div
        className={`absolute inset-0 bg-ink-900/50 ${asSheet ? '' : 'animate-fade-in'}`}
        style={
          asSheet
            ? {
                opacity: phase === 'open' ? 1 : 0,
                transition: `opacity ${SHEET_DURATION}ms ${SHEET_EASING}`,
              }
            : undefined
        }
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : t('a11y.dialog')}
        style={sheetStyle}
        className={`relative z-10 max-h-[92vh] w-full overflow-hidden rounded-t-2xl bg-white
                    shadow-2xl sm:rounded-2xl ${asSheet ? '' : 'animate-slide-up'} ${SIZES[size]}`}
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
