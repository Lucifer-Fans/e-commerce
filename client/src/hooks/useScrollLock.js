import { useEffect, useRef } from 'react';
import {
  lockBodyScroll,
  unlockBodyScroll,
  registerOverlay,
  releaseOverlay,
} from '../utils/scrollLock';

/**
 * The one hook every overlay on the site uses — modal, bottom sheet, drawer,
 * lightbox, dropdown. While `active` is true the page behind cannot scroll or
 * rubber-band, including when a finger is dragged across the backdrop or an
 * empty part of the overlay on a touch device.
 *
 * Attach the returned ref to the overlay's outermost element; anything inside it
 * that is genuinely scrollable (a dialog body, a drawer's nav list, a thumbnail
 * rail) keeps scrolling normally, and pinch gestures are never intercepted.
 *
 *   const overlayRef = useScrollLock(open);
 *   ...
 *   <div ref={overlayRef} className="fixed inset-0">…</div>
 */
export default function useScrollLock(active = true) {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    const node = overlayRef.current;
    lockBodyScroll();
    registerOverlay(node);

    return () => {
      releaseOverlay(node);
      unlockBodyScroll();
    };
  }, [active]);

  return overlayRef;
}
