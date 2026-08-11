const fs = require('fs/promises');
const path = require('path');

const env = require('../config/env');
const logger = require('../utils/logger');
const seoService = require('../services/seo.service');
const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } = require('../config/languages');

/**
 * Serves the storefront's index.html with its meta tags rewritten for the URL
 * actually requested.
 *
 * The build-time plugin (client/plugins/seoHtml.js) already bakes the site-wide
 * defaults into the file, which is enough for a static deploy. This goes the rest
 * of the way: a link to /product/steel-spring-x1 pasted into WhatsApp unfurls as
 * that product, with its own title, description and photo, because the crawler
 * that fetched it — which runs no JavaScript — was handed those tags directly.
 *
 * The injected tags carry `data-rh="true"`, react-helmet-async's own marker, so
 * when the bundle boots helmet adopts and replaces them instead of leaving the
 * server's copy and the client's copy fighting over the same head.
 *
 * Opt-in: without CLIENT_DIST_PATH the API serves no HTML at all and behaves
 * exactly as it did before.
 */

const MARKER = /(<!--seo-->)[\s\S]*?(<!--\/seo-->)/;

/** Anything with a file extension is an asset — let express.static 404 it. */
const LOOKS_LIKE_FILE = /\.[a-z0-9]{1,8}$/i;

const escapeAttr = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/**
 * Every supported language is an Indian regional locale, same as the client's
 * i18n/languages.js — the only place the two lists could drift is a future
 * non-IN language, which would need adding in both.
 */
const ogLocale = (code) => `${code}_IN`;

/* ---------------- index.html cache ---------------- */
/**
 * In production the file changes only on deploy, so it is read once. Outside
 * production it is re-read whenever the mtime moves, so a rebuild is picked up
 * without restarting the API.
 */
let cached = { html: null, mtimeMs: 0 };

async function readTemplate(indexPath) {
  if (env.isProd && cached.html) return cached.html;

  const { mtimeMs } = await fs.stat(indexPath);
  if (cached.html && mtimeMs === cached.mtimeMs) return cached.html;

  cached = { html: await fs.readFile(indexPath, 'utf8'), mtimeMs };
  return cached.html;
}

/* ---------------- Tag rendering ---------------- */

function renderTags(meta, requestPath) {
  const site = seoService.SITE_URL;
  const url = `${site}${meta.canonicalPath}`;
  const lang = meta.lang || DEFAULT_LANGUAGE;
  const out = [];
  const push = (markup) => out.push(`    ${markup}`);

  push(`<title data-rh="true">${escapeAttr(meta.title)}</title>`);
  if (meta.description) {
    push(`<meta data-rh="true" name="description" content="${escapeAttr(meta.description)}" />`);
  }
  if (meta.keywords?.length) {
    push(
      `<meta data-rh="true" name="keywords" content="${escapeAttr(meta.keywords.join(', '))}" />`
    );
  }
  push(`<link data-rh="true" rel="canonical" href="${escapeAttr(url)}" />`);

  if (meta.noIndex) {
    push(`<meta data-rh="true" name="robots" content="noindex, nofollow" />`);
  } else {
    // hreflang hangs off the canonical path, never off the query string it varies by.
    for (const code of SUPPORTED_LANGUAGES) {
      push(
        `<link data-rh="true" rel="alternate" hreflang="${code}" href="${escapeAttr(
          `${site}${meta.canonicalPath}?lang=${code}`
        )}" />`
      );
    }
    push(
      `<link data-rh="true" rel="alternate" hreflang="x-default" href="${escapeAttr(
        `${site}${meta.canonicalPath}`
      )}" />`
    );
  }

  push(`<meta data-rh="true" property="og:type" content="${escapeAttr(meta.type)}" />`);
  push(`<meta data-rh="true" property="og:title" content="${escapeAttr(meta.title)}" />`);
  if (meta.description) {
    push(
      `<meta data-rh="true" property="og:description" content="${escapeAttr(meta.description)}" />`
    );
  }
  push(`<meta data-rh="true" property="og:url" content="${escapeAttr(url)}" />`);
  push(`<meta data-rh="true" property="og:site_name" content="${escapeAttr(meta.siteName)}" />`);
  push(`<meta data-rh="true" property="og:locale" content="${ogLocale(lang)}" />`);
  for (const code of SUPPORTED_LANGUAGES) {
    if (code === lang) continue;
    push(`<meta data-rh="true" property="og:locale:alternate" content="${ogLocale(code)}" />`);
  }
  if (meta.image) {
    push(`<meta data-rh="true" property="og:image" content="${escapeAttr(meta.image)}" />`);
  }

  push(
    `<meta data-rh="true" name="twitter:card" content="${
      meta.image ? 'summary_large_image' : 'summary'
    }" />`
  );
  push(`<meta data-rh="true" name="twitter:title" content="${escapeAttr(meta.title)}" />`);
  if (meta.description) {
    push(
      `<meta data-rh="true" name="twitter:description" content="${escapeAttr(meta.description)}" />`
    );
  }
  if (meta.image) {
    push(`<meta data-rh="true" name="twitter:image" content="${escapeAttr(meta.image)}" />`);
  }

  if (meta.jsonLd) {
    // `<` is escaped so a product name containing "</script>" cannot break out.
    const json = JSON.stringify(meta.jsonLd).replace(/</g, '\\u003c');
    push(`<script data-rh="true" type="application/ld+json">${json}</script>`);
  }

  logger.debug(`[seo] ${requestPath} -> ${meta.title}`);
  return out.join('\n');
}

/**
 * @param {string} distPath  absolute path to the client build directory
 */
function createHtmlMeta(distPath) {
  const indexPath = path.join(distPath, 'index.html');

  return async function htmlMeta(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (LOOKS_LIKE_FILE.test(req.path)) return next();
    // An unmatched API path is a JSON 404, not a page. Falling through to the SPA
    // here would hand every API client an HTML body its error handling cannot read.
    if (req.path === env.apiPrefix || req.path.startsWith(`${env.apiPrefix}/`)) return next();

    let html;
    try {
      html = await readTemplate(indexPath);
    } catch (err) {
      logger.error(`[seo] cannot read ${indexPath}: ${err.message}`);
      return next();
    }

    // `<html lang>` matters to crawlers and screen readers as much as the meta do.
    const lang = SUPPORTED_LANGUAGES.includes(req.language) ? req.language : DEFAULT_LANGUAGE;

    let body = html;
    let status = 200;
    try {
      const meta = await seoService.resolveMeta(req.path, lang);

      // An alias path answers with a real redirect rather than the SPA, so a
      // crawler follows it to the canonical page instead of recording the alias.
      // The query string rides along — `?lang=` is how an hreflang alternate picks
      // its language, and dropping it would land the visitor in English.
      if (meta.redirectTo) {
        const query = req.originalUrl.slice(req.path.length);
        return res.redirect(meta.status || 301, `${meta.redirectTo}${query}`);
      }

      status = meta.status || 200;
      body = html
        .replace(/<html([^>]*)\slang="[^"]*"/i, '<html$1')
        .replace(/<html([^>]*)>/i, `<html$1 lang="${lang}">`)
        .replace(MARKER, `$1\n${renderTags({ ...meta, lang }, req.path)}\n    $2`);
    } catch (err) {
      // A database hiccup must not take the storefront down with it: the baked-in
      // defaults are stale, not broken, and the SPA rewrites them on boot anyway.
      logger.error(`[seo] meta injection failed for ${req.path}: ${err.message}`);
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    // Per-URL and per-language: a shared cache must not hand a Tamil visitor the
    // Hindi head. Short-lived so an edited product updates its own preview.
    res.set('Cache-Control', 'public, max-age=0, s-maxage=300');
    res.set('Vary', 'Accept-Language');
    return res.status(status).send(body);
  };
}

module.exports = createHtmlMeta;
