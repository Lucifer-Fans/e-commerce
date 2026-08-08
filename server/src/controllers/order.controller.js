const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const { Order, Cart, Address, Coupon } = require('../models');
const { calculateTotals, eligibleSubtotal, lineTotal } = require('../services/pricing.service');
const { reserveStock, releaseStock } = require('../services/inventory.service');
const { streamInvoice } = require('../services/invoice.service');
const mailService = require('../services/mail.service');
const broadcast = require('../realtime/broadcast');
const { STATUS_FLOW } = require('../models/Order');

/**
 * Rebuilds the order from server-side truth: live product prices, live stock,
 * a re-validated coupon. Nothing the client sends about money is trusted.
 */
async function buildOrderDraft({ userId, addressId, couponCode }) {
  const cart = await Cart.findOne({ user: userId })
    .populate({
      path: 'items.product',
      populate: [
        { path: 'category', select: 'name' },
        { path: 'subCategory', select: 'name' },
      ],
    })
    .populate('items.variant');

  const active = (cart?.items || []).filter((i) => !i.savedForLater);
  if (!active.length) throw ApiError.badRequest('Your cart is empty');

  const address = await Address.findOne({ _id: addressId, user: userId });
  if (!address) throw ApiError.badRequest('Please select a valid delivery address');

  const items = [];
  for (const line of active) {
    const p = line.product;
    if (!p || p.status !== 'published') {
      throw ApiError.badRequest(`"${p?.name || 'An item'}" is no longer available. Please update your cart.`);
    }

    // Every number below comes from the exact SKU when the product is varied — its price,
    // its stock, its imagery, its shipping weight.
    const v = line.variant;
    if (p.hasVariants && (!v || !v.isActive)) {
      throw ApiError.badRequest(
        `The selected option for "${p.name}" is no longer available. Please update your cart.`
      );
    }

    const name = p.name;
    const label = v ? `${p.name} (${v.label})` : p.name;
    const stock = v ? v.stock : p.stock;
    if (stock < line.quantity) {
      throw ApiError.badRequest(
        `Only ${stock} unit(s) of "${label}" left in stock. Please update your cart.`
      );
    }

    const finalPrice = v ? v.finalPrice : p.finalPrice;

    items.push({
      product: p._id,
      variant: v?._id || null,
      variantSku: v?.sku,
      variantLabel: v?.label,
      variantAttributes: (v?.attributes || []).map((a) => ({ name: a.name, value: a.value })),
      weight: v?.weight?.value ? { value: v.weight.value, unit: v.weight.unit } : undefined,
      dimensions: v?.dimensions?.length || v?.dimensions?.width || v?.dimensions?.height
        ? {
            length: v.dimensions.length,
            width: v.dimensions.width,
            height: v.dimensions.height,
            unit: v.dimensions.unit,
          }
        : undefined,
      name,
      slug: p.slug,
      image:
        v?.images?.[0]?.url || p.images?.find((i) => i.isPrimary)?.url || p.images?.[0]?.url,
      brand: p.brand,
      categoryName: p.category?.name,
      subCategoryName: p.subCategory?.name,
      price: v ? v.price : p.price,
      discountPercent: v ? v.discountPercent : p.discountPercent,
      finalPrice,
      quantity: line.quantity,
      // Billed from the discounted price; `price` above is the MRP, for display.
      lineTotal: lineTotal({ finalPrice, quantity: line.quantity }),
    });
  }

  // The coupon is measured against exactly what is being charged for the goods.
  const subtotal = eligibleSubtotal(items);

  let coupon = null;
  let couponDiscount = 0;
  const code = (couponCode || cart.coupon?.code || '').toUpperCase();
  if (code) {
    coupon = await Coupon.findOne({ code });
    const check = coupon?.check({ userId, subtotal });
    if (!coupon || !check.valid) throw ApiError.badRequest(check?.reason || 'Invalid coupon code');
    couponDiscount = coupon.computeDiscount(subtotal);
  }

  const totals = calculateTotals(items, { couponDiscount });

  return { cart, address, items, coupon, totals };
}

/** POST /orders/checkout-summary — priced preview before payment starts. */
exports.getCheckoutSummary = asyncHandler(async (req, res) => {
  const { addressId, couponCode } = req.body;
  const draft = await buildOrderDraft({ userId: req.user._id, addressId, couponCode });

  return sendSuccess(res, {
    message: 'Checkout summary ready',
    data: {
      items: draft.items,
      address: draft.address,
      coupon: draft.coupon ? { code: draft.coupon.code, discount: draft.totals.couponDiscount } : null,
      totals: draft.totals,
    },
  });
});

/**
 * POST /orders — creates the order and decrements stock atomically.
 * For COD the order is immediately confirmed; for Razorpay it stays `pending`
 * until /payments/verify succeeds.
 */
exports.createOrder = asyncHandler(async (req, res) => {
  const { addressId, couponCode, paymentMethod = 'razorpay', notes } = req.body;
  const userId = req.user._id;

  const draft = await buildOrderDraft({ userId, addressId, couponCode });
  const { items, address, coupon, totals } = draft;

  let order;

  const placeOrder = async (session) => {
    const opts = session ? { session } : {};

    // Conditional decrement: if another shopper drained the stock between the
    // draft and here, matchedCount is 0 and we abort.
    const decremented = [];
    for (const item of items) {
      const reserved = await reserveStock(item, opts);
      if (!reserved) {
        // Without a transaction we must undo the decrements we already made.
        if (!session) await Promise.all(decremented.map((d) => releaseStock(d)));
        throw ApiError.conflict(
          `"${item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name}" just went out of stock. Please review your cart.`
        );
      }
      decremented.push(item);
    }

    const [created] = await Order.create(
      [
        {
          user: userId,
          items,
          shippingAddress: {
            fullName: address.fullName,
            phone: address.phone,
            addressLine1: address.addressLine1,
            addressLine2: address.addressLine2,
            landmark: address.landmark,
            city: address.city,
            state: address.state,
            pincode: address.pincode,
            country: address.country,
          },
          pricing: {
            mrpTotal: totals.mrpTotal,
            subtotal: totals.subtotal,
            discount: totals.discount,
            couponCode: coupon?.code,
            couponDiscount: totals.couponDiscount,
            shipping: totals.shipping,
            total: totals.total,
          },
          paymentMethod,
          paymentStatus: 'pending',
          orderStatus: paymentMethod === 'cod' ? 'confirmed' : 'pending',
          statusHistory: [
            {
              status: paymentMethod === 'cod' ? 'confirmed' : 'pending',
              note: paymentMethod === 'cod' ? 'Order placed (cash on delivery)' : 'Awaiting payment',
              changedBy: userId,
            },
          ],
          notes,
        },
      ],
      opts
    );
    order = created;

    if (coupon) {
      const mine = coupon.usedBy.find((u) => String(u.user) === String(userId));
      if (mine) mine.count += 1;
      else coupon.usedBy.push({ user: userId, count: 1 });
      coupon.usedCount += 1;
      await coupon.save(opts);
    }

    // COD needs no payment step, so the cart can be emptied right away.
    // Prepaid carts are cleared after verification instead.
    if (paymentMethod === 'cod') {
      await Cart.updateOne(
        { user: userId },
        { $pull: { items: { savedForLater: { $ne: true } } }, $unset: { coupon: 1 } },
        opts
      );
    }
  };

  // Transactions need a replica set. Local single-node MongoDB is common in dev,
  // so fall back to the compensating (non-transactional) path when unsupported.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(() => placeOrder(session));
  } catch (err) {
    const unsupported =
      err?.code === 20 ||
      /Transaction numbers are only allowed|replica set|not supported/i.test(err?.message || '');
    if (!unsupported) throw err;
    await placeOrder(null);
  } finally {
    await session.endSession();
  }

  if (paymentMethod === 'cod') {
    mailService
      .sendOrderConfirmationEmail({ to: req.user.email, name: req.user.name, order })
      .catch(() => {});
  }

  // Admins see the order land; every open product page sees the stock it consumed.
  broadcast.orderCreated(order);
  broadcast.stockChanged(items, { reason: 'order_placed' });
  if (paymentMethod === 'cod') {
    broadcast.cartUpdated(userId, null, { originSocketId: req.get('x-socket-id') });
  }

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Order placed successfully',
    data: { order },
  });
});

/** GET /orders — the signed-in shopper's order history. */
exports.getMyOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 10);

  const filter = { user: req.user._id };
  if (req.query.status && req.query.status !== 'all') filter.orderStatus = req.query.status;

  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean({ virtuals: true }),
    Order.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    message: 'Orders fetched',
    data: { orders },
    meta: paginationMeta({ total, page, limit }),
  });
});

/** GET /orders/:id — owner or admin. */
exports.getOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'name email phone')
    .populate('payment', 'status method razorpayPaymentId amount createdAt');

  if (!order) throw ApiError.notFound('Order not found');
  if (req.user.role !== 'admin' && String(order.user._id) !== String(req.user._id)) {
    throw ApiError.forbidden('You cannot view this order');
  }

  return sendSuccess(res, { message: 'Order fetched', data: { order } });
});

/** GET /orders/:id/invoice — streams a PDF. */
exports.downloadInvoice = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  if (req.user.role !== 'admin' && String(order.user) !== String(req.user._id)) {
    throw ApiError.forbidden('You cannot download this invoice');
  }
  if (order.paymentStatus !== 'paid' && order.paymentMethod !== 'cod') {
    throw ApiError.badRequest('Invoice is available once payment is complete');
  }

  // Awaited: the PDF resolves its branding, artwork and QR before it writes a
  // byte, so a failure there is still a JSON error rather than a truncated file.
  await streamInvoice(order, res);
});

/** PATCH /orders/:id/cancel — shopper-initiated. */
exports.cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  if (String(order.user) !== String(req.user._id)) throw ApiError.forbidden('You cannot cancel this order');
  if (!STATUS_FLOW[order.orderStatus]?.includes('cancelled')) {
    throw ApiError.badRequest(`An order that is ${order.orderStatus.replace(/_/g, ' ')} cannot be cancelled`);
  }

  // Cancelling returns the reserved units to the exact SKU they were taken from.
  await Promise.all(order.items.map((item) => releaseStock(item)));

  order.orderStatus = 'cancelled';
  order.cancelledAt = new Date();
  order.cancellationReason = req.body.reason || 'Cancelled by customer';
  order.statusHistory.push({
    status: 'cancelled',
    note: order.cancellationReason,
    changedBy: req.user._id,
  });
  if (order.paymentStatus === 'paid') order.paymentStatus = 'refunded';
  await order.save();

  broadcast.orderStatusChanged(order, order.cancellationReason);
  broadcast.stockChanged(order.items, { reason: 'order_cancelled' });

  return sendSuccess(res, { message: 'Order cancelled', data: { order } });
});

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

/** GET /orders/admin/all */
exports.listAllOrders = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 15);

  const filter = {};
  if (req.query.status && req.query.status !== 'all') filter.orderStatus = req.query.status;
  if (req.query.paymentStatus && req.query.paymentStatus !== 'all') {
    filter.paymentStatus = req.query.paymentStatus;
  }
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    if (req.query.to) filter.createdAt.$lte = new Date(`${req.query.to}T23:59:59.999Z`);
  }
  if (req.query.search) {
    const safe = String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    filter.$or = [
      { orderNumber: rx },
      { 'items.name': rx },
      { 'shippingAddress.fullName': rx },
      { 'shippingAddress.phone': rx },
    ];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean({ virtuals: true }),
    Order.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    message: 'Orders fetched',
    data: { orders },
    meta: paginationMeta({ total, page, limit }),
  });
});

/** PATCH /orders/:id/status (admin) */
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note, trackingNumber, courierPartner, expectedDeliveryDate } = req.body;

  const order = await Order.findById(req.params.id).populate('user', 'name email');
  if (!order) throw ApiError.notFound('Order not found');

  if (order.orderStatus !== status && !STATUS_FLOW[order.orderStatus]?.includes(status)) {
    throw ApiError.badRequest(
      `Cannot move an order from "${order.orderStatus}" to "${status}". Allowed: ${
        STATUS_FLOW[order.orderStatus]?.join(', ') || 'none'
      }`
    );
  }

  if (status === 'cancelled' || status === 'returned') {
    // A return restocks the SKU that came back, not the product in general — a returned
    // Black/M must never make Blue/L look available.
    await Promise.all(order.items.map((item) => releaseStock(item)));
    if (order.paymentStatus === 'paid') order.paymentStatus = 'refunded';
    order.cancelledAt = new Date();
    order.cancellationReason = note || `Marked ${status} by admin`;
  }

  order.orderStatus = status;
  if (trackingNumber !== undefined) order.trackingNumber = trackingNumber;
  if (courierPartner !== undefined) order.courierPartner = courierPartner;
  if (expectedDeliveryDate) order.expectedDeliveryDate = new Date(expectedDeliveryDate);
  if (status === 'delivered') {
    order.deliveredAt = new Date();
    // Cash is collected on handover, so delivery is the moment COD becomes paid.
    if (order.paymentMethod === 'cod') order.paymentStatus = 'paid';
  }

  order.statusHistory.push({ status, note, changedBy: req.user._id });
  await order.save();

  broadcast.orderStatusChanged(order, note);
  if (status === 'cancelled' || status === 'returned') {
    broadcast.stockChanged(order.items, { reason: `order_${status}` });
  }

  if (order.user?.email) {
    mailService
      .sendOrderStatusEmail({ to: order.user.email, name: order.user.name, order })
      .catch(() => {});
  }

  return sendSuccess(res, { message: `Order marked as ${status.replace(/_/g, ' ')}`, data: { order } });
});

/** GET /orders/admin/statuses — drives the admin status dropdown. */
exports.getStatusOptions = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    message: 'Status options fetched',
    data: { statuses: Object.keys(STATUS_FLOW), flow: STATUS_FLOW },
  })
);

exports.buildOrderDraft = buildOrderDraft;
