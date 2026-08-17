const { Coupon, Order } = require('../models');
const logger = require('../utils/logger');

/**
 * Redemption is a property of a *successful* order, not of applying a code.
 *
 * A shopper typing FLAT500 into the cart consumes nothing; neither does opening
 * a Razorpay window and closing it. The counter moves once — when the order is
 * actually earned (cash on delivery is placed, or a prepaid payment captures) —
 * and moves back if that order is later cancelled or refunded.
 *
 * `order.couponRedeemed` is the flag that makes "once" true. It is flipped by a
 * conditional update, so whichever caller wins the race owns the increment and
 * every other caller — a retried /payments/verify, a webhook arriving after it,
 * a double-clicked button — is a no-op.
 */

const couponRefOf = (order) =>
  order?.pricing?.couponId ? { couponId: order.pricing.couponId, userId: order.user?._id || order.user } : null;

/**
 * @returns {'skipped'|'redeemed'|'duplicate'|'exhausted'}
 *   `duplicate` — this order already redeemed; nothing to do.
 *   `exhausted` — the coupon's global limit filled up before this order claimed it.
 */
async function redeemForOrder(order, opts = {}) {
  const ref = couponRefOf(order);
  if (!ref) return 'skipped';

  // A cancelled or returned order is not a success, however late the callback
  // announcing its payment arrives — otherwise a webhook landing after the
  // shopper cancelled would re-consume the redemption they were just given back.
  if (['cancelled', 'returned'].includes(order.orderStatus)) return 'skipped';

  // Claim the flag before touching the coupon: the increment is only ever
  // attempted by the one caller that moved this order from false to true.
  const claimed = await Order.updateOne(
    { _id: order._id, couponRedeemed: { $ne: true } },
    { $set: { couponRedeemed: true } },
    opts
  );
  if (claimed.modifiedCount === 0) return 'duplicate';

  const ok = await Coupon.claim(ref, opts);
  if (!ok) {
    // Hand the flag back so a later retry can try again against a coupon that
    // may have had a slot released in the meantime.
    await Order.updateOne({ _id: order._id }, { $set: { couponRedeemed: false } }, opts);
    return 'exhausted';
  }

  order.couponRedeemed = true;
  return 'redeemed';
}

/** Undoes {@link redeemForOrder}. Safe to call on an order that never redeemed. */
async function releaseForOrder(order, opts = {}) {
  const ref = couponRefOf(order);
  if (!ref) return false;

  // Only the order holding the flag may give the slot back, so two cancellation
  // paths racing on the same order cannot release it twice.
  const released = await Order.updateOne(
    { _id: order._id, couponRedeemed: true },
    { $set: { couponRedeemed: false } },
    opts
  );
  if (released.modifiedCount === 0) return false;

  await Coupon.release(ref, opts);
  order.couponRedeemed = false;
  logger.info(`Released coupon ${order.pricing.couponCode} back from order ${order.orderNumber}`);
  return true;
}

module.exports = { redeemForOrder, releaseForOrder };
