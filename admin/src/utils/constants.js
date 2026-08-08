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
  refunded: 'default',
};

export const PRODUCT_STATUS_COLOR = {
  draft: 'default',
  published: 'success',
  archived: 'warning',
};

export const MAX_PRODUCT_IMAGES = 5;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
