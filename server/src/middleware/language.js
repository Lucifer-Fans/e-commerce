const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } = require('../config/languages');

/**
 * Decides which language the catalogue should be served in, and hangs it on
 * `req.language` for the controllers.
 *
 * Order, most explicit first:
 *   1. `?lang=ta`          — shareable links and the hreflang alternates
 *   2. `Accept-Language`   — what the storefront sends on every request
 *   3. the signed-in user's saved preference
 *   4. English
 *
 * `Accept-Language` is parsed loosely on purpose: the browser may send a full
 * q-weighted list (`ta-IN,ta;q=0.9,en;q=0.8`), and the storefront sends a bare
 * code. Both must work, and anything unrecognised must fall back rather than 400 —
 * a malformed header from some crawler is not a reason to fail a product page.
 */
function resolveLanguage(req, _res, next) {
  const supported = (code) =>
    code && SUPPORTED_LANGUAGES.includes(code) ? code : null;

  // Narrow `ta-IN` → `ta`, ignore weights.
  const fromTag = (tag) => {
    if (!tag) return null;
    const base = String(tag).trim().toLowerCase().split(';')[0].split('-')[0];
    return supported(base);
  };

  const fromQuery = fromTag(req.query.lang);

  const fromHeader = (req.headers['accept-language'] || '')
    .split(',')
    .map(fromTag)
    .find(Boolean);

  // `protect` may not have run on public routes, so this is simply absent there.
  const fromUser = supported(req.user?.preferredLanguage);

  req.language = fromQuery || fromHeader || fromUser || DEFAULT_LANGUAGE;
  next();
}

module.exports = resolveLanguage;
