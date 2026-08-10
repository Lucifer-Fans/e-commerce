import { useEffect } from 'react';
import { registerOverlay, releaseOverlay } from '../utils/scrollLock';

/**
 * Every overlay in the admin panel is a MUI Dialog, Drawer, Menu or Popover, and
 * each of those portals a `.MuiModal-root` element into <body> while it is open.
 * Watching for those means the touch guard covers the whole panel without every
 * dialog having to opt in.
 *
 * Poppers (tooltips, autocomplete lists) are deliberately ignored: they are not
 * modal, and the page is expected to keep scrolling underneath them.
 *
 * A `keepMounted` modal (the mobile nav drawer) leaves its root in the DOM while
 * closed, so presence alone is not enough — it has to be visible as well, or the
 * guard would cancel every wheel/touch gesture in the panel for good.
 *
 * Mounted once, from <App>.
 */
const OVERLAY_SELECTOR = '.MuiModal-root';

function isVisible(node) {
  const style = window.getComputedStyle(node);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export default function useOverlayScrollGuard() {
  useEffect(() => {
    const tracked = new Set();

    const sync = () => {
      const open = new Set(
        [...document.querySelectorAll(OVERLAY_SELECTOR)].filter(isVisible),
      );

      tracked.forEach((node) => {
        if (!open.has(node)) {
          releaseOverlay(node);
          tracked.delete(node);
        }
      });

      open.forEach((node) => {
        if (!tracked.has(node)) {
          registerOverlay(node);
          tracked.add(node);
        }
      });
    };

    const observer = new MutationObserver(sync);
    // `style`/`class` matter too: a keepMounted modal opens and closes by flipping
    // its own visibility rather than by entering or leaving the DOM.
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
    sync();

    return () => {
      observer.disconnect();
      tracked.forEach(releaseOverlay);
      tracked.clear();
    };
  }, []);
}
