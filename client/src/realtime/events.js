/**
 * Mirror of server/src/realtime/events.js — keep the two in step.
 * Importing the names rather than typing string literals means a rename breaks the
 * build instead of silently switching a listener off.
 */
export const EVENTS = {
  READY: 'realtime:ready',
  SUBSCRIBE: 'realtime:subscribe',
  UNSUBSCRIBE: 'realtime:unsubscribe',

  PRODUCT_CREATED: 'product:created',
  PRODUCT_UPDATED: 'product:updated',
  PRODUCT_DELETED: 'product:deleted',
  PRODUCT_STOCK_CHANGED: 'product:stock-changed',
  PRODUCT_VARIANTS_CHANGED: 'product:variants-changed',

  CATEGORY_CHANGED: 'category:changed',
  SUBCATEGORY_CHANGED: 'subcategory:changed',
  BRAND_CHANGED: 'brand:changed',
  BANNER_CHANGED: 'banner:changed',
  COUPON_CHANGED: 'coupon:changed',
  SETTINGS_UPDATED: 'settings:updated',

  REVIEW_CREATED: 'review:created',
  REVIEW_UPDATED: 'review:updated',
  REVIEW_DELETED: 'review:deleted',

  CART_UPDATED: 'cart:updated',
  WISHLIST_UPDATED: 'wishlist:updated',
  PROFILE_UPDATED: 'profile:updated',
  ACCOUNT_STATUS_CHANGED: 'account:status-changed',
  ADDRESS_CHANGED: 'address:changed',
  SESSIONS_CHANGED: 'sessions:changed',
  SESSION_REVOKED: 'session:revoked',

  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_STATUS_CHANGED: 'order:status-changed',
  PAYMENT_UPDATED: 'payment:updated',
};

/** Anything that can change what a product list or grid should show. */
export const CATALOG_EVENTS = [
  EVENTS.PRODUCT_CREATED,
  EVENTS.PRODUCT_UPDATED,
  EVENTS.PRODUCT_DELETED,
  EVENTS.PRODUCT_STOCK_CHANGED,
  // A regenerated or repriced SKU set changes what a card and a selector should show.
  EVENTS.PRODUCT_VARIANTS_CHANGED,
];

/** Anything that changes the shopper's own order history. */
export const ORDER_EVENTS = [
  EVENTS.ORDER_CREATED,
  EVENTS.ORDER_UPDATED,
  EVENTS.ORDER_STATUS_CHANGED,
  EVENTS.PAYMENT_UPDATED,
];

export const REVIEW_EVENTS = [EVENTS.REVIEW_CREATED, EVENTS.REVIEW_UPDATED, EVENTS.REVIEW_DELETED];

export const rooms = {
  product: (id) => `product:${id}`,
  order: (id) => `order:${id}`,
};
