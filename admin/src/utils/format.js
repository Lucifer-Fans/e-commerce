const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const inrPrecise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

export const formatPrice = (value, precise = false) =>
  (precise ? inrPrecise : inr).format(Number(value) || 0);

export const formatNumber = (value) => new Intl.NumberFormat('en-IN').format(Number(value) || 0);

export const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

export const titleCase = (value = '') =>
  String(value).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Cloudinary transform helper — thumbnails in tables should not download full-size art. */
export function thumb(url, size = 80) {
  if (!url || !url.includes('/upload/')) return url;
  return url.replace('/upload/', `/upload/w_${size},h_${size},c_fill,q_auto,f_auto/`);
}

export const primaryImageOf = (product) =>
  product?.images?.find((i) => i.isPrimary)?.url || product?.images?.[0]?.url || '';

/** finalPrice is computed server-side; this mirrors it for live preview in the wizard. */
export const computeFinalPrice = (price, discountPercent) => {
  const p = Number(price) || 0;
  const d = Number(discountPercent) || 0;
  return Math.round((p - (p * d) / 100) * 100) / 100;
};
