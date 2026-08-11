const { Product, Setting } = require('../models');
const { localize } = require('../utils/localize');
const { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } = require('../config/languages');
const env = require('../config/env');

/**
 * Resolves the meta tags for a storefront URL, server-side.
 *
 * The storefront renders its own tags with react-helmet-async, which covers every
 * visitor and Google. What it cannot cover is the crawler behind a WhatsApp,
 * Facebook, Twitter or LinkedIn link preview: those fetch the HTML and never run
 * the bundle, so they see whatever shipped in index.html. This module produces the
 * same copy helmet would, from the same sources — the admin's Organization
 * settings for the site-wide default, the product document for a product page —
 * so an unfurled link matches the page it points at.
 *
 * Deliberately mirrors client/src/components/common/Seo.jsx: same title
 * composition (`page | site`), same fallbacks, same language handling. When one
 * changes the other has to follow, or a shared link stops matching its page.
 */

const SITE_URL = env.clientUrl.replace(/\/+$/, '');

/* ---------------- Settings cache ---------------- */
/**
 * Every HTML request would otherwise cost a settings read. The document changes a
 * few times a year and the window is short enough that an admin who saves and then
 * reshares a link sees the new copy within a minute.
 */
const SETTINGS_TTL_MS = 60_000;
let settingsCache = { value: null, at: 0 };

async function getSettings() {
  const now = Date.now();
  if (settingsCache.value && now - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  const settings = await Setting.getSingleton();
  settingsCache = { value: settings.toJSON(), at: now };
  return settingsCache.value;
}

/** Called from the settings controller so a save is reflected immediately. */
const clearSettingsCache = () => {
  settingsCache = { value: null, at: 0 };
};

/* ---------------- Helpers ---------------- */

/** Product descriptions are rich-text HTML; a meta description must be plain prose. */
function toPlainText(html, maxLength = 200) {
  const text = String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;
  // Cut on a word boundary so the preview never ends mid-word.
  const clipped = text.slice(0, maxLength - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped).trim()}…`;
}

const absolute = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${SITE_URL}/${String(url).replace(/^\/+/, '')}`;
};

/**
 * Routes behind the login wall, plus the auth screens themselves. They carry no
 * value in an index and some carry a token in the path, so they are marked
 * noindex and skip the database lookup entirely.
 */
const PRIVATE_PREFIXES = [
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

/**
 * Static pages, keyed by path. English only: the client's i18n bundles are the
 * source of truth for this copy and they live in the browser, not here. A crawler
 * asking for a Hindi product page still gets Hindi — that copy is in the document.
 */
const STATIC_ROUTES = {
  '/products': {
    title: 'All Products',
    description: 'Browse the full catalogue — filter by category, brand, price and rating.',
  },
  '/contact': {
    title: 'Contact Us',
    description: 'Get in touch with our team — address, phone, email and enquiry form.',
  },
  '/careers': {
    title: 'Careers',
    description: 'Open roles and how to apply.',
  },

  /*
   * The informational and policy pages. They are the pages most often shared as a
   * bare link — a shopper sending "here's their return policy" to a colleague —
   * and the ones a search engine is most likely to index for a question, so an
   * unfurled preview and an indexed snippet both have to say something real.
   *
   * Mirrors the `legal` translation bundle the SPA renders from; see
   * client/src/i18n/locales/en/legal.json.
   */
  '/about': {
    title: 'About Us',
    description:
      'An Indian online store for building materials, hardware and tools — genuine brands, transparent pricing, secure payments and delivery across India.',
  },
  '/shipping-policy': {
    title: 'Shipping Policy',
    description:
      'Order processing, delivery charges, estimated delivery times, delivery areas across India, tracking, delays, address problems and damaged parcels.',
  },
  '/returns': {
    title: 'Returns & Refunds',
    description:
      'Return eligibility, the 7-day return window, product condition, non-returnable items, damaged or wrong deliveries, pickup, inspection and replacement.',
  },
  '/refund-policy': {
    title: 'Refund Policy',
    description:
      'When a refund is due, how long it takes, which method it returns to, and how cancelled orders, approved returns, failed payments and cash on delivery are treated.',
  },
  '/faq': {
    title: 'FAQs',
    description:
      'Answers to common questions about ordering, payment, delivery, cancellation, returns, refunds and your account.',
  },
  '/terms': {
    title: 'Terms & Conditions',
    description:
      'The terms governing accounts, orders, pricing, payments, cancellation, shipping, returns, refunds, coupons, intellectual property and liability.',
  },
  '/privacy': {
    title: 'Privacy Policy',
    description:
      'What personal information we collect, how it is used, the cookies we rely on, the payment and service providers involved, security, retention and your rights.',
  },
};

/**
 * Policy URLs people type or link to that are not the canonical one. The SPA
 * redirects them client-side; this makes the server say the same thing with a
 * 301, so a crawler follows it to the real page instead of recording the alias as
 * a duplicate — or, worse, as the soft 404 an unknown path resolves to below.
 *
 * Kept in step with the alias routes in client/src/routes/index.jsx.
 */
const ALIAS_ROUTES = {
  '/about-us': '/about',
  '/shipping': '/shipping-policy',
  '/return-policy': '/returns',
  '/returns-policy': '/returns',
  '/refunds': '/refund-policy',
  '/faqs': '/faq',
  '/terms-and-conditions': '/terms',
  '/terms-of-service': '/terms',
  '/privacy-policy': '/privacy',
};

const isPrivate = (pathname) =>
  PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

/* ---------------- Resolution ---------------- */

/**
 * @param {string} pathname  storefront path, no query string (e.g. "/product/steel-x1")
 * @param {string} lang      resolved request language
 * @returns {Promise<object>} the meta the page should carry
 */
async function resolveMeta(pathname, lang = DEFAULT_LANGUAGE) {
  const settings = await getSettings();
  const patch =
    lang && lang !== DEFAULT_LANGUAGE ? settings.translations?.[lang] || null : null;

  const siteName = settings.general?.siteName?.trim() || env.appName;
  const defaults = {
    title: patch?.metaTitle?.trim() || settings.seo?.metaTitle?.trim() || siteName,
    description: patch?.metaDescription?.trim() || settings.seo?.metaDescription?.trim() || '',
    keywords: settings.seo?.metaKeywords || [],
    image: absolute(settings.branding?.logo?.url),
  };

  const base = {
    ...defaults,
    siteName,
    type: 'website',
    canonicalPath: pathname,
    noIndex: false,
    jsonLd: null,
    // What the response should be sent with. A URL the SPA renders as its
    // not-found screen has to answer 404 as well, or search engines record a
    // "soft 404" — a page that claims to exist and shows nothing.
    status: 200,
  };

  // Before anything else: an alias is not a page, it is a pointer to one.
  const alias = ALIAS_ROUTES[pathname.replace(/\/$/, '')];
  if (alias) return { ...base, redirectTo: alias, canonicalPath: alias, status: 301 };

  if (isPrivate(pathname)) {
    return { ...base, title: `${siteName}`, noIndex: true };
  }

  const productSlug = pathname.match(/^\/product\/([^/]+)\/?$/)?.[1];
  if (productSlug) return productMeta(decodeURIComponent(productSlug), lang, base);

  const staticRoute = STATIC_ROUTES[pathname.replace(/\/$/, '') || '/'];
  if (staticRoute) {
    return {
      ...base,
      title: `${staticRoute.title} | ${siteName}`,
      description: staticRoute.description,
    };
  }

  // Home keeps the site-wide defaults verbatim; anything unrecognised is the SPA's
  // not-found screen, so it answers as one.
  if (pathname === '/' || pathname === '') return base;
  return { ...base, noIndex: true, status: 404 };
}

/**
 * A product page's own copy, matching what ProductDetails.jsx passes to <Seo>:
 * the admin's per-product meta when set, the product's own name/short description
 * otherwise — both already overlaid with the requested language.
 */
async function productMeta(slug, lang, base) {
  const doc = await Product.findOne({ slug, status: 'published' })
    .select('name slug shortDescription description images tags meta translations ratings finalPrice price')
    .lean();

  // An unpublished or deleted product is a 404 in the SPA — do not let it be
  // indexed or unfurled under the site-wide default copy.
  if (!doc) return { ...base, noIndex: true, status: 404 };

  const product = localize(doc, lang);
  const image = product.images?.find((img) => img.isPrimary) || product.images?.[0];

  const title = product.meta?.title?.trim() || product.name;
  const description =
    product.meta?.description?.trim() ||
    toPlainText(product.shortDescription || product.description);

  return {
    ...base,
    title: `${title} | ${base.siteName}`,
    description,
    keywords: product.meta?.keywords?.length ? product.meta.keywords : product.tags || [],
    image: absolute(image?.url) || base.image,
    type: 'product',
    canonicalPath: `/product/${product.slug}`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      inLanguage: lang || DEFAULT_LANGUAGE,
      name: product.name,
      description,
      ...(image?.url ? { image: absolute(image.url) } : {}),
      ...(product.ratings?.count
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: product.ratings.average,
              reviewCount: product.ratings.count,
            },
          }
        : {}),
    },
  };
}

module.exports = {
  resolveMeta,
  clearSettingsCache,
  getSettings,
  toPlainText,
  isPrivate,
  SITE_URL,
  SUPPORTED_LANGUAGES,
};
