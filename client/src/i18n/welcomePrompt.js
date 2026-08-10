import { STORAGE_KEY } from './index';

/**
 * The hand-off between "the sign-up just completed" and "the home page is on
 * screen" — the only two moments the welcome language prompt cares about.
 *
 * It is a stored flag rather than router state or a React ref because the two
 * moments are separated by a redirect the shopper may reload through, and by a
 * provider that lives outside the router. sessionStorage scopes it to this tab
 * and this visit: an unconsumed flag can never resurface days later as a popup
 * on an ordinary visit.
 */
const KEY = `${STORAGE_KEY}.welcomePending`;

/** Called when an account has been created *and* verified. */
export function markWelcomePending() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* no storage — the prompt is skipped, which is the safe way to be wrong */
  }
}

/** Reads and clears in one go, so the prompt is offered exactly once. */
export function consumeWelcomePending() {
  try {
    if (!sessionStorage.getItem(KEY)) return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
