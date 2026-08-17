const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Order, Payment, Cart } = require('../models');
const { releaseStock } = require('../services/inventory.service');
const { redeemForOrder, releaseForOrder } = require('../services/coupon.service');
const razorpay = require('../services/razorpay.service');
const mailService = require('../services/mail.service');
const broadcast = require('../realtime/broadcast');
const logger = require('../utils/logger');

/** GET /payments/config — public key + enabled flag for the checkout widget. */
exports.getConfig = asyncHandler(async (_req, res) =>
  sendSuccess(res, {
    message: 'Payment config fetched',
    data: { enabled: razorpay.isEnabled(), keyId: razorpay.keyId || null, currency: 'INR' },
  })
);

/** POST /payments/create-order  { orderId } */
exports.createPaymentOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.body.orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (String(order.user) !== String(req.user._id)) throw ApiError.forbidden();
  if (order.paymentStatus === 'paid') throw ApiError.badRequest('This order is already paid');
  if (order.orderStatus === 'cancelled') throw ApiError.badRequest('This order was cancelled');

  const rzpOrder = await razorpay.createOrder({
    amount: order.pricing.total,
    receipt: order.orderNumber,
    notes: { orderId: String(order._id), userId: String(req.user._id) },
  });

  const payment = await Payment.create({
    order: order._id,
    user: req.user._id,
    provider: 'razorpay',
    razorpayOrderId: rzpOrder.id,
    amount: order.pricing.total,
    status: 'created',
  });

  order.payment = payment._id;
  await order.save();

  return sendSuccess(res, {
    message: 'Payment initiated',
    data: {
      keyId: razorpay.keyId,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      orderNumber: order.orderNumber,
      prefill: { name: req.user.name, email: req.user.email, contact: req.user.phone || '' },
    },
  });
});

/**
 * POST /payments/verify — the client hands back what Razorpay's checkout returned.
 * Nothing is trusted until the HMAC signature matches.
 */
exports.verifyPayment = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, signature, orderId } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (String(order.user) !== String(req.user._id)) throw ApiError.forbidden();

  const payment = await Payment.findOne({ order: order._id, razorpayOrderId });
  if (!payment) throw ApiError.badRequest('No matching payment attempt found for this order');

  const valid = razorpay.verifySignature({ razorpayOrderId, razorpayPaymentId, signature });

  if (!valid) {
    payment.status = 'failed';
    payment.errorDescription = 'Signature verification failed';
    await payment.save();

    order.paymentStatus = 'failed';
    await order.save();

    broadcast.paymentUpdated(order, payment);
    throw ApiError.badRequest('Payment verification failed. If money was debited it will be refunded.');
  }

  // Confirm the amount with Razorpay directly rather than believing the client.
  let providerPayment = null;
  try {
    providerPayment = await razorpay.fetchPayment(razorpayPaymentId);
  } catch (err) {
    logger.warn(`Could not fetch Razorpay payment ${razorpayPaymentId}: ${err.message}`);
  }

  if (providerPayment && providerPayment.amount !== razorpay.toPaise(order.pricing.total)) {
    payment.status = 'failed';
    payment.errorDescription = 'Amount mismatch';
    await payment.save();
    throw ApiError.badRequest('Payment amount does not match the order total');
  }

  payment.razorpayPaymentId = razorpayPaymentId;
  payment.razorpaySignature = signature;
  payment.status = 'captured';
  payment.method = providerPayment?.method;
  payment.rawResponse = providerPayment || undefined;
  await payment.save();

  order.paymentStatus = 'paid';
  if (order.orderStatus === 'pending') {
    order.orderStatus = 'confirmed';
    order.statusHistory.push({
      status: 'confirmed',
      note: 'Payment received',
      changedBy: req.user._id,
      actor: 'customer',
    });
  }
  await order.save();

  // The money landed, so the order is earned and its coupon is now spent. The
  // flag inside redeemForOrder makes this exactly-once: a shopper who refreshes
  // into a second /verify, or a webhook that lands after this one, changes
  // nothing. If the coupon filled up store-wide while this shopper was paying we
  // honour the discount they were charged and only log it — refusing money that
  // has already been captured would be the worse failure.
  if ((await redeemForOrder(order)) === 'exhausted') {
    logger.warn(
      `Order ${order.orderNumber} paid with ${order.pricing.couponCode} after its usage limit filled; discount honoured`
    );
  }

  // Only the purchased lines leave the cart; "saved for later" survives checkout.
  await Cart.updateOne(
    { user: req.user._id },
    { $pull: { items: { savedForLater: { $ne: true } } }, $unset: { coupon: 1 } }
  );

  mailService
    .sendOrderConfirmationEmail({ to: req.user.email, name: req.user.name, order })
    .catch(() => {});

  broadcast.paymentUpdated(order, payment);
  broadcast.orderStatusChanged(order, 'Payment received');
  broadcast.cartUpdated(req.user._id, null, { originSocketId: req.get('x-socket-id') });

  return sendSuccess(res, { message: 'Payment successful', data: { order, payment } });
});

/** POST /payments/failed — records an abandoned/failed attempt and frees the stock. */
exports.recordFailure = asyncHandler(async (req, res) => {
  const { orderId, razorpayOrderId, code, description } = req.body;

  const order = await Order.findById(orderId);
  if (!order) throw ApiError.notFound('Order not found');
  if (String(order.user) !== String(req.user._id)) throw ApiError.forbidden();

  await Payment.updateOne(
    { order: order._id, ...(razorpayOrderId ? { razorpayOrderId } : {}) },
    { status: 'failed', errorCode: code, errorDescription: description }
  );

  if (order.paymentStatus !== 'paid') {
    order.paymentStatus = 'failed';
    await order.save();
    broadcast.paymentUpdated(order, null);
  }

  return sendSuccess(res, { message: 'Payment failure recorded', data: { order } });
});

/**
 * POST /payments/webhook — Razorpay server-to-server callback. Mounted before the
 * JSON body parser so the raw buffer is available for signature verification.
 */
exports.webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = req.rawBody || req.body;

  if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Rejected Razorpay webhook with an invalid signature');
    return res.status(400).json({ success: false, message: 'Invalid signature' });
  }

  const event = JSON.parse(rawBody.toString());
  const entity = event.payload?.payment?.entity;

  if (event.event === 'payment.captured' && entity) {
    const payment = await Payment.findOne({ razorpayOrderId: entity.order_id });
    if (payment && payment.status !== 'captured') {
      payment.status = 'captured';
      payment.razorpayPaymentId = entity.id;
      payment.method = entity.method;
      await payment.save();

      // Idempotent: the verify endpoint may already have promoted this order.
      const promoted = await Order.updateOne(
        { _id: payment.order, paymentStatus: { $ne: 'paid' } },
        { paymentStatus: 'paid', orderStatus: 'confirmed' }
      );

      // The webhook is the safety net for a shopper who closed the tab before
      // /payments/verify ran, so it redeems too. redeemForOrder is idempotent per
      // order, so whichever of the two arrives second consumes nothing.
      const order = await Order.findById(payment.order);
      if (order) await redeemForOrder(order);

      // Only announce when this webhook is the one that moved the order — otherwise
      // /payments/verify already told everyone.
      if (promoted.modifiedCount > 0 && order) {
        broadcast.paymentUpdated(order, payment);
        broadcast.orderStatusChanged(order, 'Payment confirmed by provider');
      }
    }
  }

  if (event.event === 'payment.failed' && entity) {
    await Payment.updateOne(
      { razorpayOrderId: entity.order_id },
      { status: 'failed', errorCode: entity.error_code, errorDescription: entity.error_description }
    );

    const failed = await Payment.findOne({ razorpayOrderId: entity.order_id });
    if (failed) broadcast.paymentUpdated(await Order.findById(failed.order), failed);
  }

  return res.json({ success: true });
});

/** POST /payments/:id/refund (admin) */
exports.refund = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id);
  if (!payment) throw ApiError.notFound('Payment not found');
  if (payment.status !== 'captured') throw ApiError.badRequest('Only captured payments can be refunded');

  const refund = await razorpay.refundPayment({
    paymentId: payment.razorpayPaymentId,
    amount: req.body.amount,
    notes: { reason: req.body.reason || 'Admin initiated refund' },
  });

  payment.status = 'refunded';
  payment.refund = {
    refundId: refund.id,
    amount: refund.amount / 100,
    status: refund.status,
    processedAt: new Date(),
  };
  await payment.save();

  const order = await Order.findById(payment.order);
  if (order) {
    order.paymentStatus = 'refunded';
    await order.save();
    // A refunded order is no longer a successful redemption.
    await releaseForOrder(order);

    // Refunding an order that never shipped should release its inventory.
    if (['pending', 'confirmed', 'packed'].includes(order.orderStatus)) {
      // Released against the exact SKU each line reserved.
      await Promise.all(order.items.map((item) => releaseStock(item)));
      broadcast.stockChanged(order.items, { reason: 'order_refunded' });
    }
  }

  broadcast.paymentUpdated(order, payment);

  return sendSuccess(res, { message: 'Refund initiated', data: { payment } });
});
