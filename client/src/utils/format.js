import i18n from '../i18n';
import { getLanguage } from '../i18n/languages';

/**
 * Number and date formatting follows the active language, so a Tamil shopper sees
 * Tamil month names without any component having to know about locales.
 *
 * Currency stays INR everywhere — this is an Indian storefront and the price is the
 * price; only its *presentation* is localised. Intl instances are memoised per
 * locale because constructing one is comparatively expensive and these run inside
 * product grids.
 */
const cache = new Map();

const activeLocale = () => getLanguage(i18n.language).locale;

const formatter = (kind, options) => {
  const locale = activeLocale();
  const key = `${kind}:${locale}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      kind.startsWith('date')
        ? new Intl.DateTimeFormat(locale, options)
        : new Intl.NumberFormat(locale, options)
    );
  }
  return cache.get(key);
};

export const formatPrice = (value, { precise = false } = {}) => {
  const n = Number(value) || 0;
  return formatter(precise ? 'inrPrecise' : 'inr', {
    style: 'currency',
    currency: 'INR',
    ...(precise ? { minimumFractionDigits: 2 } : { maximumFractionDigits: 0 }),
  }).format(n);
};

export const formatNumber = (value) => formatter('number').format(Number(value) || 0);

export const formatDate = (value, opts = {}) =>
  new Date(value).toLocaleDateString(activeLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...opts,
  });

export const formatDateTime = (value) =>
  new Date(value).toLocaleString(activeLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/**
 * "2 days ago" style label for review and order timelines. The unit and the
 * surrounding phrase are both translated, and the plural form is i18next's job —
 * languages that don't split on one/many simply provide a single form.
 */
export function timeAgo(value) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  const units = [
    ['year', 31536000], ['month', 2592000], ['week', 604800],
    ['day', 86400], ['hour', 3600], ['minute', 60],
  ];
  for (const [unit, secondsInUnit] of units) {
    const count = Math.floor(seconds / secondsInUnit);
    if (count >= 1) {
      return i18n.t('time.ago', { value: i18n.t(`time.${unit}`, { count }) });
    }
  }
  return i18n.t('time.justNow');
}

export const titleCase = (value = '') =>
  String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Cloudinary on-the-fly resize; non-Cloudinary URLs pass through untouched. */
export function optimisedImage(url, { width = 500, height, crop = 'fill' } = {}) {
  if (!url || !url.includes('/upload/')) return url;
  const parts = [`w_${width}`, height && `h_${height}`, `c_${crop}`, 'q_auto', 'f_auto']
    .filter(Boolean)
    .join(',');
  return url.replace('/upload/', `/upload/${parts}/`);
}

export const primaryImageOf = (product) =>
  product?.images?.find((i) => i.isPrimary)?.url || product?.images?.[0]?.url || '';

export const discountLabel = (product) =>
  product?.discountPercent > 0
    ? i18n.t('product.discountOff', { percent: Math.round(product.discountPercent) })
    : null;
