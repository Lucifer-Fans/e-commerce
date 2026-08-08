import { RECENTLY_VIEWED_KEY, MAX_RECENTLY_VIEWED } from './constants';

/** Recently-viewed is a client-only concern; only ids are stored, never product data. */
export function getRecentlyViewed() {
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function pushRecentlyViewed(productId) {
  if (!productId) return;
  try {
    const list = getRecentlyViewed().filter((id) => id !== productId);
    list.unshift(productId);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(list.slice(0, MAX_RECENTLY_VIEWED)));
  } catch {
    /* private browsing / quota — the feature is optional */
  }
}

export function clearRecentlyViewed() {
  localStorage.removeItem(RECENTLY_VIEWED_KEY);
}
