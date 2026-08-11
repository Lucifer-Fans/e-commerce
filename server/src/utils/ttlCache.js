/**
 * A small in-process cache for reads that are hit constantly and change rarely —
 * the store settings, the category tree, the banner rota. Each of those is fetched
 * on essentially every cold page load, and each is edited a handful of times a
 * month, so serving them out of memory removes a round trip from the critical path
 * without the response ever being meaningfully out of date.
 *
 * Deliberately *not* a shared cache. It lives in one process and is invalidated by
 * the same controller that performs the write, so a multi-instance deployment can
 * serve a stale copy from a peer for up to one TTL. That is the accepted trade:
 * these values are cosmetic-to-slightly-stale, the client also revalidates over the
 * socket, and the alternative is a Redis dependency this project does not otherwise
 * need.
 *
 * The codebase already grew three copies of the `{ value, at }` idiom by hand
 * (geo.service, mail.service's branding cache, seo.service's settings cache); this
 * is that pattern with the two things they each lack — per-key entries and
 * single-flight.
 */

/**
 * @param {object}  options
 * @param {number}  options.ttlMs   how long an entry stays fresh.
 * @param {number}  [options.max]   entry ceiling before the oldest is dropped.
 */
function createTtlCache({ ttlMs, max = 64 }) {
  /** @type {Map<string, {value: unknown, at: number}>} */
  const entries = new Map();
  /** In-flight loads, so a burst of concurrent misses issues one query, not N. */
  const inFlight = new Map();

  /**
   * Returns the cached value for `key`, calling `loader()` on a miss.
   *
   * @param {string} key
   * @param {() => Promise<any>} loader
   */
  async function resolve(key, loader) {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;

    // A second caller arriving mid-load waits on the first one's promise rather
    // than starting its own. Without this a cold cache under load fires one query
    // per concurrent request — exactly when the database can least afford it.
    const pending = inFlight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      const value = await loader();
      // Plain FIFO eviction: this bounds memory, it is not a hit-rate strategy.
      if (entries.size >= max && !entries.has(key)) {
        entries.delete(entries.keys().next().value);
      }
      entries.set(key, { value, at: Date.now() });
      return value;
    })().finally(() => inFlight.delete(key));

    inFlight.set(key, promise);
    return promise;
  }

  /** Drops one key, or everything when called bare. Used by the write paths. */
  function clear(key) {
    if (key === undefined) entries.clear();
    else entries.delete(key);
  }

  return { resolve, clear };
}

module.exports = { createTtlCache };
