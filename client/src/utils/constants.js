export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Premium Store';
export const SITE_URL = import.meta.env.VITE_SITE_URL || 'http://localhost:5173';
/** Blank when Google sign-in isn't configured — the UI hides the button in that case. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

/*
 * These carry the API's values only — their labels are translation keys resolved
 * at the point of render (`shop:sort.*`, `checkout:track.*`), so a language switch
 * updates them like every other string.
 */
export const SORT_OPTIONS = [
  'newest',
  'popular',
  'price_asc',
  'price_desc',
  'discount',
  'rating',
  'name_asc',
];

export const DISCOUNT_FILTERS = [10, 20, 30, 40, 50];
export const RATING_FILTERS = [4, 3, 2, 1];

export const ORDER_STATUS_STEPS = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

/**
 * How far a shopper may cancel on their own — mirrors CUSTOMER_CANCELLABLE in
 * server/src/models/Order.js. Once the parcel is with a courier the button stays
 * on screen but explains itself instead of cancelling; the endpoint enforces the
 * same window, so this list only decides what the page says.
 */
export const CUSTOMER_CANCELLABLE_STATUSES = ['pending', 'confirmed', 'packed'];

/** Statuses that end an order — nothing follows them on the timeline. */
export const ORDER_CLOSED_STATUSES = ['cancelled', 'returned'];

export const ORDER_STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 ring-blue-200',
  packed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  shipped: 'bg-violet-50 text-violet-700 ring-violet-200',
  out_for_delivery: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
  delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  returned: 'bg-slate-100 text-slate-700 ring-slate-200',
};

export const PAYMENT_STATUS_STYLES = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  // Money owed back reads as outstanding, the same as money still owed; only a
  // completed refund goes quiet.
  refund_pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  refunded: 'bg-slate-100 text-slate-700 ring-slate-200',
};

/*
 * Delivery pricing, mirrored from the server's `commerce` config
 * (server/src/config/env.js → FREE_SHIPPING_THRESHOLD / SHIPPING_FLAT_RATE).
 *
 * Cart and checkout never read these — every total the shopper is charged comes
 * back priced from the API. They exist for the pages that quote the rule without
 * a basket in hand: the shipping, refund and FAQ policies. Change them here and
 * in the server's .env together, or the policy will describe a price the checkout
 * does not charge.
 */
export const FREE_SHIPPING_THRESHOLD = Number(
  import.meta.env.VITE_FREE_SHIPPING_THRESHOLD || 499
);
export const SHIPPING_FLAT_RATE = Number(import.meta.env.VITE_SHIPPING_FLAT_RATE || 49);

/**
 * When the policy pages were last revised. Bumped by hand whenever the copy in a
 * `legal` translation bundle changes in a way a shopper would care about — it is
 * the date printed under every policy heading.
 */
export const POLICY_LAST_UPDATED = '2026-08-17';

/*
 * What a shopper may attach to a review. Mirrored by the API — server/src/
 * middleware/upload.js holds the same mime lists and size caps, and Review.MAX_MEDIA
 * the same count — so these only decide what the picker offers and what it rejects
 * before spending a round trip.
 */
export const REVIEW_MEDIA_MAX = 5;
export const REVIEW_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
export const REVIEW_VIDEO_TYPES = ['video/mp4'];
export const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REVIEW_VIDEO_BYTES = 30 * 1024 * 1024;

export const RECENTLY_VIEWED_KEY = 'ps_recently_viewed';
export const GUEST_CART_KEY = 'ps_guest_cart';
export const MAX_RECENTLY_VIEWED = 12;
