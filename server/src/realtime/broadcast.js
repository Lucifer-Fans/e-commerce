const rt = require('./index');
const EVENTS = require('./events');
const logger = require('../utils/logger');

/**
 * Domain-level realtime notifications.
 *
 * Controllers call these instead of emitting raw events, so the room/payload rules
 * for each resource live in exactly one place. Every function is fire-and-forget:
 * a realtime failure must never turn a successful write into a failed request.
 */

/** Wraps a broadcast so a throw can never escape into the request pipeline. */
const safe =
  (fn) =>
  (...args) => {
    try {
      const result = fn(...args);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => logger.warn(`Realtime broadcast failed: ${err.message}`));
      }
    } catch (err) {
      logger.warn(`Realtime broadcast failed: ${err.message}`);
    }
  };

/** Trimmed order shape for list rows and toasts — the full document stays out of the wire. */
const orderSummary = (order) => ({
  _id: String(order._id),
  orderNumber: order.orderNumber,
  orderStatus: order.orderStatus,
  paymentStatus: order.paymentStatus,
  paymentMethod: order.paymentMethod,
  total: order.pricing?.total,
  itemCount: order.items?.length || 0,
  trackingNumber: order.trackingNumber,
  courierPartner: order.courierPartner,
  expectedDeliveryDate: order.expectedDeliveryDate,
  deliveredAt: order.deliveredAt,
  cancelledAt: order.cancelledAt,
  user: order.user?._id
    ? { _id: String(order.user._id), name: order.user.name, email: order.user.email }
    : { _id: String(order.user) },
  createdAt: order.createdAt,
  updatedAt: order.updatedAt,
});

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

/**
 * Stock moved. Emitted to the public room so every open list re-reads, and to the
 * per-product room so an open detail page can patch its buy-box without a refetch.
 * `items` is [{ product, quantity }] — the live stock is looked up so listeners get
 * an absolute value rather than a delta they might apply twice.
 */
exports.stockChanged = safe(async (items, { reason } = {}) => {
  if (!rt.getIO() || !items?.length) return;

  const { Product, ProductVariant } = require('../models');
  const ids = [...new Set(items.map((i) => String(i.product || i._id)).filter(Boolean))];
  if (!ids.length) return;

  const products = await Product.find({ _id: { $in: ids } })
    .select('stock lowStockThreshold status name slug hasVariants')
    .lean();

  // Per-SKU stock rides along, so an open product page can grey out the exact size that
  // just sold out instead of reloading every combination.
  const variedIds = products.filter((p) => p.hasVariants).map((p) => p._id);
  const variantRows = variedIds.length
    ? await ProductVariant.find({ product: { $in: variedIds } })
        .select('product sku stock isActive')
        .lean()
    : [];

  const variantsByProduct = new Map();
  for (const v of variantRows) {
    const key = String(v.product);
    if (!variantsByProduct.has(key)) variantsByProduct.set(key, []);
    variantsByProduct.get(key).push({
      variantId: String(v._id),
      sku: v.sku,
      stock: v.stock,
      inStock: v.isActive && v.stock > 0,
    });
  }

  for (const product of products) {
    const payload = {
      productId: String(product._id),
      slug: product.slug,
      name: product.name,
      stock: product.stock,
      inStock: product.stock > 0,
      lowStock: product.stock > 0 && product.stock <= (product.lowStockThreshold ?? 0),
      status: product.status,
      variants: variantsByProduct.get(String(product._id)) || undefined,
      reason,
    };
    rt.toPublic(EVENTS.PRODUCT_STOCK_CHANGED, payload);
    rt.toProduct(product._id, EVENTS.PRODUCT_STOCK_CHANGED, payload);
  }

  rt.invalidateDashboard('stock');
});

/**
 * A product's SKU set changed — a combination was generated, repriced, restocked or
 * removed. An open product page re-reads its variants so the selector, the buy box and
 * the availability of every chip stay truthful without a refresh.
 */
exports.variantsChanged = safe((action, product) => {
  if (!product) return;
  const payload = {
    action,
    productId: String(product._id),
    slug: product.slug,
    summary: product.variantSummary || null,
    stock: product.stock,
  };
  rt.toPublic(EVENTS.PRODUCT_VARIANTS_CHANGED, payload);
  rt.toProduct(product._id, EVENTS.PRODUCT_VARIANTS_CHANGED, payload);
  rt.invalidateDashboard('product');
});

const productPayload = (product) => ({
  productId: String(product._id),
  slug: product.slug,
  name: product.name,
  status: product.status,
  stock: product.stock,
  price: product.price,
  finalPrice: product.finalPrice,
  discountPercent: product.discountPercent,
});

exports.productCreated = safe((product) => {
  rt.toPublic(EVENTS.PRODUCT_CREATED, productPayload(product));
  rt.invalidateDashboard('product');
});

exports.productUpdated = safe((product) => {
  const payload = productPayload(product);
  rt.toPublic(EVENTS.PRODUCT_UPDATED, payload);
  rt.toProduct(product._id, EVENTS.PRODUCT_UPDATED, payload);
  rt.invalidateDashboard('product');
});

exports.productDeleted = safe((product) => {
  const payload = { productId: String(product._id), slug: product.slug, name: product.name };
  rt.toPublic(EVENTS.PRODUCT_DELETED, payload);
  rt.toProduct(product._id, EVENTS.PRODUCT_DELETED, payload);
  rt.invalidateDashboard('product');
});

exports.categoryChanged = safe((action, category) =>
  rt.toPublic(EVENTS.CATEGORY_CHANGED, {
    action,
    categoryId: category ? String(category._id) : null,
    name: category?.name,
    slug: category?.slug,
  })
);

exports.subCategoryChanged = safe((action, subCategory) =>
  rt.toPublic(EVENTS.SUBCATEGORY_CHANGED, {
    action,
    subCategoryId: subCategory ? String(subCategory._id) : null,
    name: subCategory?.name,
    slug: subCategory?.slug,
    categoryId: subCategory?.category ? String(subCategory.category) : null,
  })
);

exports.brandChanged = safe((action, brand) =>
  rt.toPublic(EVENTS.BRAND_CHANGED, {
    action,
    brandId: brand ? String(brand._id) : null,
    name: brand?.name,
    slug: brand?.slug,
  })
);

exports.bannerChanged = safe((action, banner) =>
  rt.toPublic(EVENTS.BANNER_CHANGED, {
    action,
    bannerId: banner ? String(banner._id) : null,
    placement: banner?.placement,
  })
);

exports.couponChanged = safe((action, coupon) =>
  rt.toPublic(EVENTS.COUPON_CHANGED, {
    action,
    couponId: coupon ? String(coupon._id) : null,
    code: coupon?.code,
  })
);

exports.settingsUpdated = safe((settings) =>
  rt.toPublic(EVENTS.SETTINGS_UPDATED, { settings })
);

/* ------------------------------------------------------------------ *
 * Inquiries & careers
 *
 * These are admin-only feeds: the storefront never lists other people's
 * messages, so nothing is emitted to the public room.
 * ------------------------------------------------------------------ */

exports.inquiryCreated = safe((inquiry) => {
  rt.toAdmins(EVENTS.INQUIRY_CREATED, {
    inquiryId: String(inquiry._id),
    name: inquiry.name,
    email: inquiry.email,
    subject: inquiry.subject,
  });
  rt.toAdmins(EVENTS.ADMIN_NOTIFICATION, {
    kind: 'inquiry',
    severity: 'info',
    title: 'New enquiry received',
    message: `${inquiry.name} · ${inquiry.subject || 'Contact form'}`,
    link: '/inquiries',
    at: new Date().toISOString(),
  });
});

exports.inquiryChanged = safe((action, inquiry) =>
  rt.toAdmins(EVENTS.INQUIRY_CHANGED, {
    action,
    inquiryId: inquiry ? String(inquiry._id) : null,
  })
);

exports.jobApplicationCreated = safe((application) => {
  rt.toAdmins(EVENTS.JOB_APPLICATION_CREATED, {
    applicationId: String(application._id),
    name: application.name,
    position: application.position,
  });
  rt.toAdmins(EVENTS.ADMIN_NOTIFICATION, {
    kind: 'career',
    severity: 'info',
    title: 'New job application',
    message: `${application.name} · ${application.position}`,
    link: '/inquiries?tab=careers',
    at: new Date().toISOString(),
  });
});

exports.jobApplicationChanged = safe((action, application) =>
  rt.toAdmins(EVENTS.JOB_APPLICATION_CHANGED, {
    action,
    applicationId: application ? String(application._id) : null,
    status: application?.status,
  })
);

/**
 * Newsletter sign-ups and status flips. Admin-only — a subscriber list is private,
 * and a sign-up is too quiet an event to warrant a notification toast.
 */
exports.newsletterChanged = safe((action, subscriber) =>
  rt.toAdmins(EVENTS.NEWSLETTER_CHANGED, {
    action,
    subscriberId: subscriber ? String(subscriber._id) : null,
    status: subscriber?.status,
  })
);

/** Open roles feed the storefront's careers dropdown, so this one is public. */
exports.careerPositionChanged = safe((action, position) =>
  rt.toPublic(EVENTS.CAREER_POSITION_CHANGED, {
    action,
    positionId: position ? String(position._id) : null,
    title: position?.title,
  })
);

/**
 * The cancel-dialog picklist changed. Public, because the storefront's dialog reads
 * the same list — an option retired here must stop being offered without a reload.
 */
exports.cancellationReasonChanged = safe((action, reason) => {
  const payload = {
    action,
    reasonId: reason ? String(reason._id) : null,
    label: reason?.label,
    isActive: reason?.isActive,
  };
  // Admins sit in the public room too, so one emit reaches the management screen.
  rt.toPublic(EVENTS.CANCELLATION_REASON_CHANGED, payload);
});

/**
 * The deactivation dialog's picklist changed. Same reach as the cancel list above
 * for the same reason: the storefront dialog reads it, and the management screen
 * that edits it sits in the public room too.
 */
exports.deactivationReasonChanged = safe((action, reason) => {
  rt.toPublic(EVENTS.DEACTIVATION_REASON_CHANGED, {
    action,
    reasonId: reason ? String(reason._id) : null,
    label: reason?.label,
    isActive: reason?.isActive,
  });
});

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

exports.reviewChanged = safe((action, review, ratings) => {
  const productId = String(review.product);
  const event =
    action === 'created'
      ? EVENTS.REVIEW_CREATED
      : action === 'deleted'
        ? EVENTS.REVIEW_DELETED
        : EVENTS.REVIEW_UPDATED;

  const payload = {
    action,
    reviewId: String(review._id),
    productId,
    rating: review.rating,
    ratings: ratings || undefined,
  };

  rt.toProduct(productId, event, payload);
  rt.toPublic(event, payload);
  rt.toAdmins(event, payload);
});

/* ------------------------------------------------------------------ *
 * Per-user state
 * ------------------------------------------------------------------ */

/**
 * The shopper's cart, pushed to their other tabs and devices.
 * `originSocketId` lets the tab that made the change skip its own echo, so an
 * optimistic UI is never overwritten by its own round trip.
 * Passing `cart: null` means "it changed, but re-read it yourself" — used where
 * serialising the cart would cost an extra populate for no benefit.
 */
exports.cartUpdated = safe((userId, cart, { originSocketId } = {}) =>
  rt.toUser(userId, EVENTS.CART_UPDATED, { cart, originSocketId: originSocketId || null })
);

exports.wishlistUpdated = safe((userId, wishlist, { originSocketId } = {}) =>
  rt.toUser(userId, EVENTS.WISHLIST_UPDATED, { wishlist, originSocketId: originSocketId || null })
);

exports.profileUpdated = safe((userId, user) =>
  rt.toUser(userId, EVENTS.PROFILE_UPDATED, { user })
);

exports.addressChanged = safe((userId, action, address) =>
  rt.toUser(userId, EVENTS.ADDRESS_CHANGED, {
    action,
    addressId: address ? String(address._id) : null,
  })
);

/**
 * The account's device list changed — a new login, or a session signed out. A hint
 * only: an open "Manage devices" screen refetches, everyone else ignores it.
 */
exports.sessionsChanged = safe((userId, action) =>
  rt.toUser(userId, EVENTS.SESSIONS_CHANGED, { action })
);

/**
 * Sessions on this account were revoked. Every device on the account hears it and
 * decides for itself whether it was one of them, because there is no way to address
 * a single browser tab directly — only the account's room.
 *
 * `sessionIds` names the sessions revoked. `exceptSessionId` inverts that for
 * "everywhere else": every device except that one is out. Passing neither means the
 * whole account is signed out, which is what blocking an account does.
 *
 * `originSocketId` is the tab that asked for this. It signs itself out on the spot
 * and says so in its own words, so it skips the echo — otherwise a deliberate
 * "log out" would also raise the alarming toast meant for a device that was signed
 * out from somewhere else.
 */
exports.sessionRevoked = safe(
  (userId, { sessionIds = null, exceptSessionId = null, reason, originSocketId } = {}) =>
    rt.toUser(userId, EVENTS.SESSION_REVOKED, {
      sessionIds: sessionIds ? sessionIds.map(String) : null,
      exceptSessionId: exceptSessionId ? String(exceptSessionId) : null,
      reason: reason || 'revoked-by-user',
      originSocketId: originSocketId || null,
    })
);

/* ------------------------------------------------------------------ *
 * Orders & payments
 * ------------------------------------------------------------------ */

exports.orderCreated = safe((order) => {
  const payload = { order: orderSummary(order) };
  rt.toUser(order.user, EVENTS.ORDER_CREATED, payload);
  rt.toAdmins(EVENTS.ORDER_CREATED, payload);
  rt.toAdmins(EVENTS.ADMIN_NOTIFICATION, {
    kind: 'order',
    severity: 'success',
    title: 'New order received',
    message: `${order.orderNumber} · ₹${order.pricing?.total ?? 0}`,
    link: `/orders/${order._id}`,
    at: new Date().toISOString(),
  });
  rt.invalidateDashboard('order');
});

/** Any change to an order after creation — status, tracking, payment, cancellation. */
exports.orderChanged = safe((order, { event = EVENTS.ORDER_UPDATED, note } = {}) => {
  const payload = { order: orderSummary(order), note };
  rt.toOrderAudience(order, event, payload);
  // Detail pages listen for a single event name regardless of what changed.
  if (event !== EVENTS.ORDER_UPDATED) rt.toOrderAudience(order, EVENTS.ORDER_UPDATED, payload);
  rt.invalidateDashboard('order');
});

exports.orderStatusChanged = safe((order, note) =>
  exports.orderChanged(order, { event: EVENTS.ORDER_STATUS_CHANGED, note })
);

exports.paymentUpdated = safe((order, payment) => {
  const payload = {
    order: order ? orderSummary(order) : null,
    payment: payment
      ? {
          _id: String(payment._id),
          status: payment.status,
          method: payment.method,
          amount: payment.amount,
        }
      : null,
  };
  if (order) rt.toOrderAudience(order, EVENTS.PAYMENT_UPDATED, payload);
  else rt.toAdmins(EVENTS.PAYMENT_UPDATED, payload);
  rt.invalidateDashboard('payment');
});

/* ------------------------------------------------------------------ *
 * Users (admin)
 * ------------------------------------------------------------------ */

exports.userChanged = safe((action, user) => {
  rt.toAdmins(EVENTS.USER_CHANGED, {
    action,
    userId: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
  });
  rt.invalidateDashboard('user');
});

/**
 * A blocked or role-changed account is told immediately, so the tab it is signed in
 * on can log out rather than waiting for its next 401.
 */
exports.accountStatusChanged = safe((user) =>
  rt.toUser(user._id, EVENTS.ACCOUNT_STATUS_CHANGED, {
    status: user.status,
    role: user.role,
    // Carried so the live toast can say why, matching what a fresh login is told.
    blockedReason: user.blockedReason || undefined,
  })
);

/**
 * The reactivation queue moved — a request arrived, or an admin decided one.
 *
 * Admin-only, and a hint rather than the document: the queue is a filtered, paged
 * list, so an open screen refetches. A submission also raises a notification,
 * because a request nobody opens is a person waiting several days for an email
 * that is never sent — this is the one event in the flow with a deadline attached
 * to it that only staff can meet.
 */
exports.reactivationRequestChanged = safe((action, request) => {
  rt.toAdmins(EVENTS.REACTIVATION_REQUEST_CHANGED, {
    action,
    requestId: request ? String(request._id) : null,
    userId: request?.user ? String(request.user._id || request.user) : null,
    status: request?.status,
  });

  if (action === 'created') {
    rt.toAdmins(EVENTS.ADMIN_NOTIFICATION, {
      kind: 'user',
      severity: 'info',
      title: 'Account reactivation requested',
      message: `${request?.name || 'A customer'} · ${request?.email || ''}`.trim(),
      link: '/reactivation-requests',
      at: new Date().toISOString(),
    });
  }
});

exports.orderSummary = orderSummary;
