export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Premium Store Admin';
export const STOREFRONT_URL = import.meta.env.VITE_STOREFRONT_URL || 'http://localhost:5173';

export const ORDER_STATUSES = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
];

/**
 * How far a *shopper* may cancel on their own — mirrors CUSTOMER_CANCELLABLE in
 * server/src/models/Order.js. Staff are not held to it: STATUS_FLOW below is the
 * wider ladder the panel works from, because a courier can still be recalled.
 */
export const CUSTOMER_CANCELLABLE_STATUSES = ['pending', 'confirmed', 'packed'];

/** Mirrors the server's STATUS_FLOW so the UI only offers legal transitions. */
export const STATUS_FLOW = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

/**
 * The fulfilment path a timeline draws, and the names it draws it under —
 * mirrors ORDER_STATUS_STEPS and the `detail.steps` copy in the storefront, so
 * the panel and the customer's own order page never name a step differently.
 */
export const ORDER_STATUS_STEPS = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

export const ORDER_STEP_LABELS = {
  pending: 'Order Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const ORDER_STATUS_COLOR = {
  pending: 'warning',
  confirmed: 'info',
  packed: 'info',
  shipped: 'secondary',
  out_for_delivery: 'primary',
  delivered: 'success',
  cancelled: 'error',
  returned: 'default',
};

export const PAYMENT_STATUS_COLOR = {
  pending: 'warning',
  paid: 'success',
  failed: 'error',
  // Money owed back is outstanding, the same as money still owed.
  refund_pending: 'warning',
  refunded: 'default',
};

/**
 * The one payment decision staff make — mirrors `canMarkRefunded` in
 * server/src/models/Order.js.
 *
 * A verified payment, a failed attempt and cash collected on delivery all move
 * the payment status on their own; cancelling a prepaid order parks it at
 * `refund_pending`. Whether the refund has actually left the account is the only
 * part no system can know, so it is the only part with a button.
 *
 * A cash-on-delivery order never gets one: cancelled before handover it stays
 * `pending`, and delivered it is marked paid without anyone lifting a finger.
 */
export const canMarkRefunded = (order) => order.paymentStatus === 'refund_pending';

export const PRODUCT_STATUS_COLOR = {
  draft: 'default',
  published: 'success',
  archived: 'warning',
};

export const MAX_PRODUCT_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * What a *picked* photo may weigh. Uploads are downscaled in the browser first
 * (see utils/media.js), so the file that actually leaves is far smaller than this
 * and MAX_IMAGE_BYTES stays the ceiling for anything posted through the server.
 */
export const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];

/** Mirrors VIDEO_ALLOWED / VIDEO_MAX_BYTES in server/src/middleware/upload.js. */
export const MAX_PRODUCT_VIDEOS = 2;
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024;
export const ACCEPTED_VIDEO_TYPES = ['video/mp4'];
