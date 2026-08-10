/**
 * Overlay scroll lock for the admin panel — the same behaviour the storefront
 * uses, kept in step with `client/src/utils/scrollLock.js`.
 *
 * MUI already puts `overflow: hidden` on the body (with scrollbar compensation)
 * whenever a Dialog, Drawer, Menu or Popover is open, so `lockBodyScroll` is
 * exported for any hand-rolled overlay but is not used by the automatic guard.
 * What MUI does not do is stop a touch drag on the backdrop or on an empty part
 * of a dialog from rubber-banding the page underneath on iOS — that is what
 * `registerOverlay` plus the non-passive `touchmove` listener below handle.
 *
 * Multi-touch is always let through, so pinching to zoom keeps working, and
 * scrolling inside the overlay's own panes is untouched.
 */

const SCROLLABLE = /(auto|scroll|overlay)/;

let lockCount = 0;
let saved = null;

/** Registered overlay roots, outermost first — the last one is the active one. */
const overlays = [];
let touchOrigin = null;
let listening = false;

/**
 * Nearest ancestor of `node` (stopping at `root`) that can absorb a drag of
 * `dx`/`dy` — i.e. it scrolls on that axis and is not already pinned at the end
 * the finger is pushing towards. Returning `null` means the gesture would chain
 * out to the page, which is exactly what we cancel.
 */
function scrollableFor(node, root, dx, dy) {
  const vertical = Math.abs(dy) >= Math.abs(dx);
  let el = node instanceof Element ? node : node?.parentElement;

  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);

    if (vertical) {
      if (SCROLLABLE.test(style.overflowY) && el.scrollHeight - el.clientHeight > 1) {
        const atTop = el.scrollTop <= 0;
        const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
        // dy > 0 means the finger travelled down, which scrolls content upwards.
        if (!(dy > 0 ? atTop : atBottom)) return el;
      }
    } else if (SCROLLABLE.test(style.overflowX) && el.scrollWidth - el.clientWidth > 1) {
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      if (!(dx > 0 ? atStart : atEnd)) return el;
    }

    if (el === root) break;
    el = el.parentElement;
  }

  return null;
}

/** True when the gesture belongs to a scrollable region of the active overlay. */
function gestureIsOwnedByOverlay(target, dx, dy) {
  const root = overlays[overlays.length - 1];
  if (!root || !root.contains(target)) return false;
  return Boolean(scrollableFor(target, root, dx, dy));
}

function onTouchStart(e) {
  touchOrigin =
    e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
}

function onTouchMove(e) {
  if (!overlays.length || !e.cancelable) return;
  if (e.touches.length > 1) return;

  const touch = e.touches[0];
  const dx = touchOrigin ? touch.clientX - touchOrigin.x : 0;
  const dy = touchOrigin ? touch.clientY - touchOrigin.y : 0;

  if (!gestureIsOwnedByOverlay(e.target, dx, dy)) e.preventDefault();
}

function onWheel(e) {
  if (!overlays.length || !e.cancelable) return;
  // Wheel deltas point the opposite way to finger travel.
  if (!gestureIsOwnedByOverlay(e.target, -e.deltaX, -e.deltaY)) e.preventDefault();
}

function startListening() {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
  document.addEventListener('wheel', onWheel, { passive: false, capture: true });
}

function stopListening() {
  if (!listening) return;
  listening = false;
  touchOrigin = null;
  document.removeEventListener('touchstart', onTouchStart, { capture: true });
  document.removeEventListener('touchmove', onTouchMove, { capture: true });
  document.removeEventListener('wheel', onWheel, { capture: true });
}

/** Mark `element` as the active overlay for the duration it is on screen. */
export function registerOverlay(element) {
  if (!element) return;
  const existing = overlays.indexOf(element);
  if (existing !== -1) overlays.splice(existing, 1);
  overlays.push(element);
  startListening();
}

export function releaseOverlay(element) {
  const index = overlays.indexOf(element);
  if (index !== -1) overlays.splice(index, 1);
  if (!overlays.length) stopListening();
}

/** Freeze the page behind a hand-rolled overlay. Safe to call repeatedly. */
export function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (++lockCount > 1) return;

  const html = document.documentElement;
  const { body } = document;
  // Width of the scrollbar we are about to hide, so the layout does not jump.
  const gap = window.innerWidth - html.clientWidth;

  saved = {
    htmlOverflow: html.style.overflow,
    htmlOverscroll: html.style.overscrollBehavior,
    bodyOverflow: body.style.overflow,
    bodyOverscroll: body.style.overscrollBehavior,
    bodyPaddingRight: body.style.paddingRight,
  };

  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';

  if (gap > 0) {
    const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + gap}px`;
  }
}

export function unlockBodyScroll() {
  if (typeof document === 'undefined' || lockCount === 0) return;
  if (--lockCount > 0) return;

  const html = document.documentElement;
  const { body } = document;

  html.style.overflow = saved.htmlOverflow;
  html.style.overscrollBehavior = saved.htmlOverscroll;
  body.style.overflow = saved.bodyOverflow;
  body.style.overscrollBehavior = saved.bodyOverscroll;
  body.style.paddingRight = saved.bodyPaddingRight;
  saved = null;
}
