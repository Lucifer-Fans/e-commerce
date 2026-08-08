import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Centralised scroll behaviour for the whole storefront. Mounted once in
 * <Layout>, so every current and future route inherits it — no page ever needs
 * its own scroll-reset effect.
 *
 *   PUSH     new page (card, link, navigate())  -> jump to the top, instantly
 *   POP      browser Back / Forward             -> restore the exact old offset
 *   REPLACE  same page, new query string        -> leave the offset alone, so
 *            filters, sort and variant sync don't yank the viewport around
 *
 * A `#hash` target always wins: it scrolls to the element regardless of type.
 * A link can opt out entirely with <Link state={{ preserveScroll: true }}>.
 */

const STORE_KEY = 'app:scroll-positions';
/** Entries are ~30 bytes; 50 covers any realistic back-stack without bloating storage. */
const MAX_ENTRIES = 50;
/** How long we keep chasing a restore while lazy chunks and images fill the page out. */
const RESTORE_BUDGET_MS = 1500;

function loadPositions() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? new Map(JSON.parse(raw)) : new Map();
  } catch {
    // Private mode, quota, or corrupt payload — restoration is a nicety, not a feature to crash over.
    return new Map();
  }
}

function savePositions(positions) {
  try {
    const trimmed = [...positions].slice(-MAX_ENTRIES);
    sessionStorage.setItem(STORE_KEY, JSON.stringify(trimmed));
  } catch {
    /* ignore */
  }
}

export default function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  const positions = useRef(null);
  if (positions.current === null) positions.current = loadPositions();

  // Live scroll offset, sampled by a passive listener. Reading window.scrollY at
  // navigation time is unreliable: the new route can already have re-clamped it.
  const offset = useRef(typeof window === 'undefined' ? 0 : window.scrollY);
  const previousKey = useRef(location.key);
  const mounted = useRef(false);
  const cancelRestore = useRef(null);

  // ── Track the current offset, and persist the map when the tab goes away. ──
  useLayoutEffect(() => {
    // We drive restoration ourselves; the browser's own attempt fires before the
    // route chunk has rendered and would land on a page that is still 0px tall.
    const nativeMode = window.history.scrollRestoration;
    if (nativeMode) window.history.scrollRestoration = 'manual';

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        offset.current = window.scrollY;
      });
    };

    const flush = () => {
      positions.current.set(previousKey.current, offset.current);
      savePositions(positions.current);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', flush);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', flush);
      flush();
      if (nativeMode) window.history.scrollRestoration = nativeMode;
    };
  }, []);

  // ── React to every navigation. ──
  useLayoutEffect(() => {
    // Any in-flight restore belongs to the page we just left.
    cancelRestore.current?.();
    cancelRestore.current = null;

    // Bank where the outgoing entry was sitting before we touch anything.
    if (mounted.current) {
      positions.current.set(previousKey.current, offset.current);
      savePositions(positions.current);
    }
    previousKey.current = location.key;

    const saved = positions.current.get(location.key);

    // Explicit opt-out for the rare link that wants the viewport left untouched.
    if (location.state?.preserveScroll) {
      mounted.current = true;
      return undefined;
    }

    // Hash targets are an explicit instruction from the author of the link.
    if (location.hash) {
      cancelRestore.current = chase(() => {
        const target = document.querySelector(location.hash);
        if (!target) return null;
        return target.getBoundingClientRect().top + window.scrollY - headerOffset();
      });
      mounted.current = true;
      return undefined;
    }

    if (navigationType === 'POP') {
      // Back / Forward: put them back exactly where they were. Content arrives in
      // waves (route chunk, then API data, then images), so keep re-applying the
      // offset until the document is actually tall enough to hold it.
      if (saved) cancelRestore.current = chase(() => saved);
      else window.scrollTo(0, 0);
    } else if (navigationType === 'PUSH') {
      // A genuinely new page — always opens from the very top.
      window.scrollTo(0, 0);
      offset.current = 0;
    }
    // REPLACE: same page rewriting its own query string. Stay put.

    mounted.current = true;

    return () => {
      cancelRestore.current?.();
      cancelRestore.current = null;
    };
    // location.key is unique per history entry, so it also covers same-path re-entry.
  }, [location.key, location.hash, navigationType]);

  return null;
}

/** Height of the sticky header, so hash targets don't land underneath it. */
function headerOffset() {
  const header = document.querySelector('header');
  return header ? header.getBoundingClientRect().height + 12 : 0;
}

/**
 * Re-applies a scroll target across frames until the document can actually reach
 * it, we run out of budget, or the user takes over. Returns a cancel function.
 */
function chase(getTarget) {
  const start = performance.now();
  let frame = 0;
  let done = false;

  const stop = () => {
    if (done) return;
    done = true;
    if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('wheel', stop);
    window.removeEventListener('touchstart', stop);
    window.removeEventListener('keydown', stop);
  };

  // The moment the user scrolls themselves, they own the viewport — back off.
  window.addEventListener('wheel', stop, { passive: true, once: true });
  window.addEventListener('touchstart', stop, { passive: true, once: true });
  window.addEventListener('keydown', stop, { once: true });

  const tick = () => {
    frame = 0;
    if (done) return;

    const target = getTarget();
    if (target !== null && target !== undefined) {
      window.scrollTo(0, target);
      const reachable = document.documentElement.scrollHeight - window.innerHeight;
      // Landed (or the page simply isn't that long) — nothing left to chase.
      if (Math.abs(window.scrollY - target) < 2 || reachable <= target) return stop();
    }

    if (performance.now() - start > RESTORE_BUDGET_MS) return stop();
    frame = requestAnimationFrame(tick);
  };

  tick();
  return stop;
}
