const asyncHandler = require('../utils/asyncHandler');
const { Product, Category } = require('../models');
const seoService = require('../services/seo.service');
const { SUPPORTED_LANGUAGES } = require('../config/languages');

/**
 * robots.txt and the sitemap set.
 *
 * Served from the API rather than dropped in client/public because the interesting
 * half is the catalogue: a static file would list whatever products existed on the
 * day it was written and go stale on the next publish.
 *
 * These live at the site root, outside the API prefix, because that is the only
 * place a crawler looks for them. If the storefront is hosted separately from this
 * API, proxy /robots.txt and /sitemap*.xml through to it.
 */

const SITE = seoService.SITE_URL;

/** Sitemaps cap at 50k URLs; 5k keeps each response small enough to serve fast. */
const CHUNK_SIZE = 5000;

/** The catalogue moves daily at most — regenerating per crawler hit is waste. */
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map();

async function cached(key, produce) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await produce();
  cache.set(key, { value, at: Date.now() });
  return value;
}

const clearCache = () => cache.clear();

const escapeXml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const sendXml = (res, xml) => {
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  return res.send(xml);
};

/**
 * One <url> entry. `alternates` emits the hreflang set so a Tamil query can land on
 * the Tamil rendering of the same page rather than competing with the English one —
 * the same relationship the page's own <link rel="alternate"> tags declare.
 */
function urlEntry({ path, lastmod, changefreq, priority, alternates = true }) {
  const loc = `${SITE}${path}`;
  const parts = [`    <loc>${escapeXml(loc)}</loc>`];

  if (alternates) {
    for (const code of SUPPORTED_LANGUAGES) {
      parts.push(
        `    <xhtml:link rel="alternate" hreflang="${code}" href="${escapeXml(
          `${loc}?lang=${code}`
        )}" />`
      );
    }
    parts.push(
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(loc)}" />`
    );
  }

  if (lastmod) parts.push(`    <lastmod>${new Date(lastmod).toISOString().slice(0, 10)}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) parts.push(`    <priority>${priority}</priority>`);

  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

const urlSet = (entries) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
  `xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries.join('\n')}\n</urlset>`;

/* ---------------- /sitemap.xml — the index ---------------- */

exports.sitemapIndex = asyncHandler(async (req, res) => {
  const xml = await cached('index', async () => {
    const total = await Product.countDocuments({ status: 'published' });
    const pages = Math.max(1, Math.ceil(total / CHUNK_SIZE));

    const children = ['/sitemap-static.xml'];
    for (let i = 1; i <= pages; i += 1) children.push(`/sitemap-products-${i}.xml`);

    const entries = children.map(
      (child) => `  <sitemap>\n    <loc>${escapeXml(`${SITE}${child}`)}</loc>\n  </sitemap>`
    );

    return (
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      `${entries.join('\n')}\n</sitemapindex>`
    );
  });

  return sendXml(res, xml);
});

/* ---------------- /sitemap-static.xml ---------------- */

/**
 * The pages that exist regardless of the catalogue, plus one entry per active
 * category — those are real landing pages, reached as a filter on /products.
 * Everything behind the login wall is left out on purpose.
 */
exports.sitemapStatic = asyncHandler(async (req, res) => {
  const xml = await cached('static', async () => {
    const entries = [
      urlEntry({ path: '/', changefreq: 'daily', priority: '1.0' }),
      urlEntry({ path: '/products', changefreq: 'daily', priority: '0.9' }),
      urlEntry({ path: '/contact', changefreq: 'yearly', priority: '0.4' }),
      urlEntry({ path: '/careers', changefreq: 'weekly', priority: '0.4' }),
    ];

    const categories = await Category.find({ isActive: true })
      .select('slug updatedAt')
      .sort({ slug: 1 })
      .lean();

    for (const category of categories) {
      entries.push(
        urlEntry({
          path: `/products?category=${encodeURIComponent(category.slug)}`,
          lastmod: category.updatedAt,
          changefreq: 'weekly',
          priority: '0.7',
        })
      );
    }

    return urlSet(entries);
  });

  return sendXml(res, xml);
});

/* ---------------- /sitemap-products-:page.xml ---------------- */

exports.sitemapProducts = asyncHandler(async (req, res, next) => {
  const page = Number(req.params.page);
  if (!Number.isInteger(page) || page < 1) return next();

  const xml = await cached(`products:${page}`, async () => {
    const products = await Product.find({ status: 'published' })
      .select('slug updatedAt images')
      .sort({ createdAt: -1 })
      .skip((page - 1) * CHUNK_SIZE)
      .limit(CHUNK_SIZE)
      .lean();

    return urlSet(
      products.map((product) =>
        urlEntry({
          path: `/product/${product.slug}`,
          lastmod: product.updatedAt,
          changefreq: 'weekly',
          priority: '0.8',
        })
      )
    );
  });

  return sendXml(res, xml);
});

/* ---------------- /robots.txt ---------------- */

exports.robots = asyncHandler(async (req, res) => {
  // Mirrors seo.service's private-route list: the pages that carry a session, a
  // cart or a one-time token, none of which mean anything to a crawler and some of
  // which would leak an order id into a search result.
  const disallow = [
    '/account',
    '/cart',
    '/checkout',
    '/order-success',
    '/wishlist',
    '/orders',
    '/profile',
    '/login',
    '/register',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
  ];

  const lines = [
    'User-agent: *',
    ...disallow.map((route) => `Disallow: ${route}`),
    '',
    `Sitemap: ${SITE}/sitemap.xml`,
    '',
  ];

  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=86400');
  return res.send(lines.join('\n'));
});

exports.clearCache = clearCache;
