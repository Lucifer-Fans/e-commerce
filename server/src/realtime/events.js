/**
 * Canonical realtime event names.
 *
 * Kept in one place because the two front-ends mirror this list verbatim
 * (client/src/realtime/events.js and admin/src/realtime/events.js) — a typo in a
 * string literal is otherwise a silent no-op that only shows up as "the page
 * stopped updating".
 *
 * Naming: "<resource>:<past-tense verb>". Payloads stay small; anything that
 * depends on paging/filters (list pages) is delivered as a hint and the client
 * refetches, while anything the client can render as-is (a cart, an order) is
 * pushed whole.
 */
const EVENTS = {
  /* ---------------- Connection ---------------- */
  READY: 'realtime:ready',
  SUBSCRIBE: 'realtime:subscribe',
  UNSUBSCRIBE: 'realtime:unsubscribe',

  /* ---------------- Catalogue (public) ---------------- */
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
  CAREER_POSITION_CHANGED: 'career:position-changed',

  REVIEW_CREATED: 'review:created',
  REVIEW_UPDATED: 'review:updated',
  REVIEW_DELETED: 'review:deleted',

  /* ---------------- Per-user ---------------- */
  CART_UPDATED: 'cart:updated',
  WISHLIST_UPDATED: 'wishlist:updated',
  PROFILE_UPDATED: 'profile:updated',
  ACCOUNT_STATUS_CHANGED: 'account:status-changed',
  ADDRESS_CHANGED: 'address:changed',
  /** The device list moved — a new login, or one signed out. */
  SESSIONS_CHANGED: 'sessions:changed',
  /**
   * This account's sessions were revoked. Delivered to the whole account, so each
   * device decides for itself whether it is one of the sessions named.
   */
  SESSION_REVOKED: 'session:revoked',

  /* ---------------- Orders & payments ---------------- */
  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_STATUS_CHANGED: 'order:status-changed',
  PAYMENT_UPDATED: 'payment:updated',

  /* ---------------- Admin-only ---------------- */
  INQUIRY_CREATED: 'inquiry:created',
  INQUIRY_CHANGED: 'inquiry:changed',
  JOB_APPLICATION_CREATED: 'job-application:created',
  JOB_APPLICATION_CHANGED: 'job-application:changed',
  NEWSLETTER_CHANGED: 'newsletter:changed',

  USER_CHANGED: 'user:changed',
  DASHBOARD_INVALIDATED: 'dashboard:invalidated',
  ADMIN_NOTIFICATION: 'admin:notification',
  PRESENCE_UPDATED: 'presence:updated',
};

module.exports = EVENTS;
