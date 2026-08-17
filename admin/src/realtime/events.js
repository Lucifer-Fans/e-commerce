/**
 * Mirror of server/src/realtime/events.js — keep the two in step.
 * The admin panel sees everything the storefront does plus the admin-only feed.
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
  CAREER_POSITION_CHANGED: 'career:position-changed',
  CANCELLATION_REASON_CHANGED: 'cancellation-reason:changed',
  DEACTIVATION_REASON_CHANGED: 'deactivation-reason:changed',

  REVIEW_CREATED: 'review:created',
  REVIEW_UPDATED: 'review:updated',
  REVIEW_DELETED: 'review:deleted',

  ACCOUNT_STATUS_CHANGED: 'account:status-changed',

  ORDER_CREATED: 'order:created',
  ORDER_UPDATED: 'order:updated',
  ORDER_STATUS_CHANGED: 'order:status-changed',
  PAYMENT_UPDATED: 'payment:updated',

  INQUIRY_CREATED: 'inquiry:created',
  INQUIRY_CHANGED: 'inquiry:changed',
  JOB_APPLICATION_CREATED: 'job-application:created',
  JOB_APPLICATION_CHANGED: 'job-application:changed',
  NEWSLETTER_CHANGED: 'newsletter:changed',

  USER_CHANGED: 'user:changed',
  REACTIVATION_REQUEST_CHANGED: 'reactivation-request:changed',
  DASHBOARD_INVALIDATED: 'dashboard:invalidated',
  ADMIN_NOTIFICATION: 'admin:notification',
  PRESENCE_UPDATED: 'presence:updated',
};

export const CATALOG_EVENTS = [
  EVENTS.PRODUCT_CREATED,
  EVENTS.PRODUCT_UPDATED,
  EVENTS.PRODUCT_DELETED,
  EVENTS.PRODUCT_STOCK_CHANGED,
  // Another admin regenerating or repricing a SKU set changes what this list should show.
  EVENTS.PRODUCT_VARIANTS_CHANGED,
];

export const ORDER_EVENTS = [
  EVENTS.ORDER_CREATED,
  EVENTS.ORDER_UPDATED,
  EVENTS.ORDER_STATUS_CHANGED,
  EVENTS.PAYMENT_UPDATED,
];

export const TAXONOMY_EVENTS = [EVENTS.CATEGORY_CHANGED, EVENTS.SUBCATEGORY_CHANGED];

export const BRAND_EVENTS = [EVENTS.BRAND_CHANGED];

/** Anything that changes what the Inquiries page shows, on either tab. */
export const INQUIRY_EVENTS = [EVENTS.INQUIRY_CREATED, EVENTS.INQUIRY_CHANGED];

export const NEWSLETTER_EVENTS = [EVENTS.NEWSLETTER_CHANGED];

export const CAREER_EVENTS = [
  EVENTS.JOB_APPLICATION_CREATED,
  EVENTS.JOB_APPLICATION_CHANGED,
  EVENTS.CAREER_POSITION_CHANGED,
];

export const rooms = {
  product: (id) => `product:${id}`,
  order: (id) => `order:${id}`,
};
