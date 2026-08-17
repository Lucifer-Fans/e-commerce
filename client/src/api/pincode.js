import { matchCity, normaliseState } from '../data/indiaLocations';

/**
 * India Post's public pincode directory. Deliberately not routed through
 * `api/client.js`: that instance carries our credentials and base URL, neither
 * of which belong on a third-party request.
 */
const ENDPOINT = 'https://api.postalpincode.in/pincode';
const TIMEOUT_MS = 6000;

/**
 * Resolves a 6-digit pincode to `{ state, city, listed }`, or null when the
 * directory has no answer. `listed` says whether the city is one the dropdown
 * offers, so the caller knows to switch to its free-text mode instead.
 *
 * Never throws for the caller's benefit — a lookup is a convenience, and a
 * network hiccup must not stop anyone from filling the fields by hand.
 */
export async function lookupPincode(pincode, { signal } = {}) {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TIMEOUT_MS);
  // Either the caller navigating away or our own deadline cancels the request.
  signal?.addEventListener('abort', () => timeout.abort(), { once: true });

  try {
    const res = await fetch(`${ENDPOINT}/${pincode}`, { signal: timeout.signal });
    if (!res.ok) return null;

    const [payload] = await res.json();
    const office = payload?.Status === 'Success' ? payload.PostOffice?.[0] : null;
    if (!office) return null;

    const state = normaliseState(office.State);
    // District is the deliverable city; Block/Name are the locality below it.
    const city = state ? matchCity(state, office.District) : '';
    return { state, city: city || office.District || '', listed: Boolean(city) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
