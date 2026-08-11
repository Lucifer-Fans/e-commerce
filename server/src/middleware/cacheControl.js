/**
 * Cache headers for the public read endpoints (catalogue, taxonomy, settings, banners).
 *
 * Express already emits a weak ETag for every JSON body, so conditional requests
 * work today — but with no `Cache-Control` the browser has nothing to revalidate
 * *against* and re-requests on every navigation. These helpers supply the missing
 * freshness window so a repeat view is served from memory, and a stale one costs a
 * 304 with no body instead of a full payload.
 *
 * Two dimensions make the same URL produce different bytes, and both must be
 * declared or a shared cache will hand the wrong copy to the wrong visitor:
 *
 *   - language — `resolveLanguage` reads `?lang` (already part of the cache key)
 *     and `Accept-Language` (which is not), so that header has to be in `Vary`.
 *   - identity — these routes run under `optionalAuth`, and an admin receives the
 *     untranslated source copy plus draft rows. Rather than let a shared cache try
 *     to key on credentials, an authenticated request opts out of caching entirely.
 */

// Appended one at a time through `res.vary()`, which de-duplicates and preserves
// the `Vary: Origin` that the CORS middleware has already set.
const VARY_ON = ['Accept-Language', 'Cookie', 'Authorization'];

/**
 * @param {number} seconds  freshness window for anonymous visitors.
 * @param {number} [swr]    how long a stale copy may still be served while it
 *                          revalidates in the background. Defaults to 10x the
 *                          window, which keeps a CDN useful during a traffic spike.
 */
function publicCache(seconds, swr = seconds * 10) {
  return function cacheControl(req, res, next) {
    // A write must never inherit a read's freshness window.
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    res.vary(VARY_ON);

    if (req.user) {
      // Admin previews and any personalised variant stay out of shared caches.
      // `no-cache` still permits the browser to hold a copy and revalidate it,
      // so the ETag round trip remains cheap.
      res.set('Cache-Control', 'private, no-cache');
      return next();
    }

    res.set(
      'Cache-Control',
      `public, max-age=${seconds}, stale-while-revalidate=${swr}`
    );
    return next();
  };
}

/**
 * Freshness windows, named so the intent survives the number.
 *
 * Taxonomy, branding and banners are edited by hand a few times a month and the
 * storefront already invalidates them over the socket, so they tolerate minutes.
 * Catalogue reads carry stock and price, which move on every order — those get
 * seconds, enough to collapse a burst of navigation without showing a sold-out
 * item as available for long.
 */
const cache = {
  taxonomy: publicCache(120),
  settings: publicCache(120),
  banners: publicCache(120),
  catalogue: publicCache(30),
  search: publicCache(60),
};

module.exports = { publicCache, cache };
