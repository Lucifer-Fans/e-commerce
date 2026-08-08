const logger = require('../utils/logger');
const env = require('../config/env');

/**
 * Approximate location for a login, used only to help the account holder recognise
 * their own sessions ("Chennai, India — that was me").
 *
 * Three sources, cheapest first:
 *   1. the client IP itself, when it is private — a LAN address has no public
 *      location, and saying so is more honest than a lookup that would resolve the
 *      server's own egress IP;
 *   2. headers a CDN in front of us already resolved (Cloudflare, Vercel, AWS
 *      CloudFront) — free, instant and more accurate than a third-party database;
 *   3. a public geo-IP API, cached in memory, behind a short timeout.
 *
 * Nothing here may ever throw or hang a login: every failure resolves to `null` and
 * the session simply carries no location.
 */

/** Successful lookups are stable for hours; a login burst must not fan out. */
const cache = new Map();
const CACHE_MAX = 500;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const PRIVATE_IP =
  /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|f[cd][\da-f]{2}:|fe80:)/i;

/**
 * The address the request actually came from.
 *
 * Express already resolves this from X-Forwarded-For because `trust proxy` is set,
 * so the header is not re-parsed here — doing that would let a client spoof its own
 * location by sending the header directly.
 */
function clientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || '';
  // Node reports IPv4 over an IPv6 socket as ::ffff:1.2.3.4.
  return String(raw).replace(/^::ffff:/, '');
}

const isPrivate = (ip) => !ip || PRIVATE_IP.test(ip);

const tidy = (value) => {
  const text = String(value || '').trim();
  // Some CDNs percent-encode non-ASCII city names ("Bengal%C4%81ru").
  if (!text || text === 'XX' || text === '-') return '';
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/** Builds the stored shape, or null when nothing useful was resolved. */
function shape({ city, region, country, countryCode }) {
  const location = {
    city: tidy(city),
    region: tidy(region),
    country: tidy(country),
    countryCode: tidy(countryCode).toUpperCase(),
  };
  return location.city || location.country || location.countryCode ? location : null;
}

/** What a CDN in front of the API already worked out for us. */
function fromHeaders(req) {
  const h = req.headers || {};
  return shape({
    city: h['cf-ipcity'] || h['x-vercel-ip-city'] || h['x-appengine-city'],
    region: h['cf-region'] || h['x-vercel-ip-country-region'] || h['x-appengine-region'],
    country: h['cf-ipcountry-name'],
    countryCode:
      h['cf-ipcountry'] ||
      h['x-vercel-ip-country'] ||
      h['cloudfront-viewer-country'] ||
      h['x-appengine-country'],
  });
}

function readCache(ip) {
  const hit = cache.get(ip);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(ip);
    return undefined;
  }
  return hit.value;
}

function writeCache(ip, value) {
  // Plain FIFO eviction — this cache exists to collapse bursts, not to be clever.
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(ip, { value, at: Date.now() });
}

/** Third-party lookup. Never throws; a slow provider is treated as no answer. */
async function fromProvider(ip) {
  if (!env.geoip.enabled) return null;

  const cached = readCache(ip);
  if (cached !== undefined) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.geoip.timeoutMs);

  try {
    const res = await fetch(env.geoip.url.replace('{ip}', encodeURIComponent(ip)), {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.json();
    // Field names differ between providers, so every common spelling is accepted.
    const location = shape({
      city: body.city,
      region: body.regionName || body.region || body.region_name || body.state,
      country: body.country || body.country_name,
      countryCode: body.countryCode || body.country_code || body.country,
    });

    writeCache(ip, location);
    return location;
  } catch (err) {
    // Cache the miss too: a provider that is down or rate-limiting will stay that
    // way for the next few logins, and each one would otherwise pay the timeout.
    writeCache(ip, null);
    if (err.name !== 'AbortError') logger.warn(`Geo lookup failed for ${ip}: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolves `{ ip, location }` for a request. Awaiting this adds at most
 * `env.geoip.timeoutMs` to a login, and only on a cache miss for a public IP.
 */
async function locate(req) {
  const ip = clientIp(req);

  if (isPrivate(ip)) return { ip, location: null };

  const header = fromHeaders(req);
  if (header) return { ip, location: header };

  return { ip, location: await fromProvider(ip) };
}

module.exports = { locate, clientIp, isPrivate };
