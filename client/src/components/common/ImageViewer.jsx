import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { optimisedImage } from '../../utils/format';
import useScrollLock from '../../hooks/useScrollLock';
import Icon from './Icon';

/** Slide-up / slide-down duration. Keep in step with the easing below. */
const DURATION = 320;
const EASING = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
/** Fraction of the viewport a horizontal drag must cross to land on the next image. */
const PAGE_RATIO = 0.25;
/** Downward drag past this many pixels dismisses the sheet. */
const DISMISS_DISTANCE = 120;

/**
 * The project's single media viewer: a bottom sheet that slides up from the
 * bottom edge over the dimmed page, holding the tapped image, a close button
 * and — when there is more than one item — a swipeable carousel with a
 * thumbnail rail. Dragging the sheet down follows the finger and flings it
 * closed, and closing slides it back down rather than blinking out.
 *
 * The page underneath stays visible but cannot scroll or be interacted with
 * until the sheet has finished sliding away.
 *
 * An entry with `type: 'video'` plays instead of rendering as a still; it needs
 * a `thumbnail` for the rail. Only the slide on screen mounts a <video>, so a
 * clip two swipes away neither downloads nor plays over the one being watched.
 *
 *   <ImageViewer open={open} images={images} index={i}
 *                onIndexChange={setI} onClose={() => setOpen(false)} />
 */
export default function ImageViewer({
  open,
  images = [],
  index = 0,
  onIndexChange,
  onClose,
  alt = '',
}) {
  const { t } = useTranslation(['shop', 'common']);
  // Freezes the product page behind the sheet, on touch as well as desktop.
  const overlayRef = useScrollLock(open);
  const closeRef = useRef(null);
  const sheetRef = useRef(null);
  const gesture = useRef(null);

  // 'enter' for the frame before the sheet slides in, 'open' once it is up,
  // 'leave' while it slides back down.
  const [phase, setPhase] = useState('enter');
  // Live finger offset; null whenever no drag is in flight.
  const [drag, setDrag] = useState(null);

  const safeIndex = Math.min(Math.max(index, 0), Math.max(images.length - 1, 0));

  // Mount off-screen, then release on the next frame so the browser has a start
  // position to animate away from.
  useEffect(() => {
    if (!open) {
      setPhase('enter');
      setDrag(null);
      return undefined;
    }

    const frame = requestAnimationFrame(() => setPhase('open'));

    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (phase === 'open') closeRef.current?.focus({ preventScroll: true });
  }, [phase]);

  /** Slide the sheet down; the parent unmounts once it is off screen. */
  const close = useCallback(() => {
    setDrag(null);
    setPhase('leave');
  }, []);

  // No dependency list: the handler closes over the live index so the arrow keys
  // always step from the image currently on screen.
  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') step(-1);
      if (e.key === 'ArrowRight') step(1);
    };

    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  });

  // Safety net: if the browser swallows the transitionend (an interrupted
  // animation, a backgrounded tab) the sheet still finishes closing.
  useEffect(() => {
    if (phase !== 'leave') return undefined;

    const timer = setTimeout(() => onClose?.(), DURATION + 80);

    return () => clearTimeout(timer);
  }, [phase, onClose]);

  if (!open || !images.length) return null;

  function step(delta) {
    if (images.length < 2) return;
    onIndexChange?.((safeIndex + delta + images.length) % images.length);
  }

  const onTouchStart = (e) => {
    if (e.touches.length !== 1 || phase !== 'open') return;
    gesture.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
  };

  const onTouchMove = (e) => {
    const start = gesture.current;
    if (!start || e.touches.length !== 1) return;

    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;

    // The first few pixels decide whether this is a page swipe or a dismiss.
    if (!start.axis && Math.abs(dx) + Math.abs(dy) > 8) {
      start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (!start.axis) return;

    // The sheet only travels downwards — it is already against the top stop.
    setDrag(start.axis === 'x' ? { x: dx, y: 0 } : { x: 0, y: Math.max(dy, 0) });
  };

  const onTouchEnd = () => {
    const start = gesture.current;
    const moved = drag;
    gesture.current = null;
    setDrag(null);
    if (!start || !moved) return;

    if (start.axis === 'y') {
      if (moved.y > DISMISS_DISTANCE) close();
      return;
    }

    const threshold = window.innerWidth * PAGE_RATIO;
    if (moved.x <= -threshold && safeIndex < images.length - 1) onIndexChange?.(safeIndex + 1);
    else if (moved.x >= threshold && safeIndex > 0) onIndexChange?.(safeIndex - 1);
  };

  const onSheetTransitionEnd = (e) => {
    if (e.target === sheetRef.current && e.propertyName === 'transform' && phase === 'leave') {
      onClose?.();
    }
  };

  // Off-screen before it enters and after it leaves; otherwise it sits at the
  // top stop, offset by however far the finger has dragged it down.
  const sheetOffset = phase === 'open' ? `${drag?.y ?? 0}px` : '100%';
  // The dim fades out with the drag, so the dismiss feels tied to the finger.
  const dimming = phase === 'open' ? 1 - Math.min((drag?.y ?? 0) / (DISMISS_DISTANCE * 2), 0.6) : 0;

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-[120] flex items-end justify-center">
      <div
        className="absolute inset-0 bg-ink-900/60"
        style={{ opacity: dimming, transition: drag ? 'none' : `opacity ${DURATION}ms ${EASING}` }}
        onClick={close}
        aria-hidden="true"
      />

      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('gallery.enlarged')}
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden
                   rounded-t-2xl bg-white shadow-2xl"
        style={{
          transform: `translate3d(0, ${sheetOffset}, 0)`,
          transition: drag ? 'none' : `transform ${DURATION}ms ${EASING}`,
        }}
        onTransitionEnd={onSheetTransitionEnd}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* The header reserves the button's full height and sits on its own
            layer: the carousel below is transformed, which would otherwise paint
            and take taps over anything the header let overflow into it. */}
        <div className="relative z-10 flex h-12 shrink-0 items-center justify-end px-2">
          {/* Grab handle — the usual hint that the sheet can be pulled down. */}
          <span
            className="absolute left-1/2 top-2.5 h-1 w-10 -translate-x-1/2 rounded-full bg-ink-200"
            aria-hidden="true"
          />
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="rounded-full p-2 text-ink-500 transition hover:bg-ink-100 hover:text-ink-900"
            aria-label={t('common:actions.close')}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {/* One full-width slide per image; the track slides by whole sheets and
            follows the finger in between. min-h-0 keeps the image from pushing
            the thumbnail rail off the bottom. */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className="flex h-full w-full"
            style={{
              transform: `translate3d(calc(${-safeIndex * 100}% + ${drag?.x ?? 0}px), 0, 0)`,
              transition: drag ? 'none' : `transform ${DURATION}ms ${EASING}`,
            }}
          >
            {images.map((image, i) =>
              image.type === 'video' ? (
                <div
                  key={image.publicId || i}
                  className="flex h-[58vh] w-full shrink-0 items-center justify-center p-3"
                  // The player's own controls need the touches the sheet would
                  // otherwise read as a swipe or a drag-to-dismiss.
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchMove={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => e.stopPropagation()}
                >
                  {i === safeIndex ? (
                    <video
                      src={image.url}
                      poster={image.thumbnail || undefined}
                      controls
                      playsInline
                      className="max-h-full max-w-full rounded-lg bg-ink-900"
                    />
                  ) : (
                    <img
                      src={image.thumbnail}
                      alt={image.alt || alt}
                      className="max-h-full max-w-full object-contain"
                      draggable="false"
                    />
                  )}
                </div>
              ) : (
                <div
                  key={image.publicId || i}
                  className="flex h-[58vh] w-full shrink-0 items-center justify-center p-3"
                >
                  <img
                    src={optimisedImage(image.url, { width: 1200, crop: 'limit' })}
                    alt={image.alt || alt}
                    className="max-h-full max-w-full object-contain"
                    draggable="false"
                  />
                </div>
              )
            )}
          </div>
        </div>

        {images.length > 1 && (
          <div className="shrink-0 border-t border-ink-200 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-center justify-center gap-1.5 pt-2.5">
              {images.map((image, i) => (
                <span
                  key={image.publicId || i}
                  aria-hidden="true"
                  className={`h-1.5 rounded-full transition-all ${
                    i === safeIndex ? 'w-5 bg-brand-600' : 'w-1.5 bg-ink-200'
                  }`}
                />
              ))}
            </div>

            <div className="hide-scrollbar flex gap-2.5 overflow-x-auto px-3 py-3">
              {images.map((image, i) => (
                <button
                  key={image.publicId || i}
                  type="button"
                  onClick={() => onIndexChange?.(i)}
                  aria-label={t('gallery.viewImage', { index: i + 1 })}
                  aria-current={i === safeIndex}
                  className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition ${
                    i === safeIndex ? 'border-brand-600' : 'border-ink-200'
                  }`}
                >
                  <img
                    src={
                      image.type === 'video'
                        ? image.thumbnail
                        : optimisedImage(image.url, { width: 160, height: 160 })
                    }
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {image.type === 'video' && (
                    <span
                      className="absolute inset-0 grid place-items-center bg-ink-900/30 text-white"
                      aria-hidden="true"
                    >
                      <Icon name="play" size={16} filled />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
