const crypto = require('crypto');
const Razorpay = require('razorpay');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

let client = null;
if (env.razorpayEnabled) {
  client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
} else {
  logger.warn('Razorpay credentials missing — online payment endpoints will return 503.');
}

function requireClient() {
  if (!client) throw ApiError.serviceUnavailable('Online payments are not configured');
  return client;
}

/** Razorpay works in the smallest currency unit (paise). */
const toPaise = (rupees) => Math.round(Number(rupees) * 100);

async function createOrder({ amount, receipt, notes = {} }) {
  return requireClient().orders.create({
    amount: toPaise(amount),
    currency: 'INR',
    receipt,
    notes,
    payment_capture: 1,
  });
}

/**
 * HMAC check on order_id|payment_id. Timing-safe compare so the signature can't
 * be brute-forced byte by byte.
 */
function verifySignature({ razorpayOrderId, razorpayPaymentId, signature }) {
  if (!env.razorpayEnabled) throw ApiError.serviceUnavailable('Online payments are not configured');
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const fetchPayment = (paymentId) => requireClient().payments.fetch(paymentId);

const refundPayment = ({ paymentId, amount, notes }) =>
  requireClient().payments.refund(paymentId, {
    ...(amount ? { amount: toPaise(amount) } : {}),
    notes,
  });

module.exports = {
  isEnabled: () => Boolean(client),
  keyId: env.razorpay.keyId,
  createOrder,
  verifySignature,
  verifyWebhookSignature,
  fetchPayment,
  refundPayment,
  toPaise,
};
