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

export const RECENTLY_VIEWED_KEY = 'ps_recently_viewed';
export const GUEST_CART_KEY = 'ps_guest_cart';
export const MAX_RECENTLY_VIEWED = 12;
