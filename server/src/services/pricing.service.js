const env = require('../config/env');

const round = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * The selling price *is* the cart price. `finalPrice` — the discounted price the
 * shopper sees on the product page — is what every line is billed at, so the
 * subtotal is already net of the product discount and that discount is never
 * deducted again further down the column. `price` (MRP) is carried for display
 * only: the struck-through original and the "you saved" figure.
 *
 * That leaves exactly one deduction, the coupon, taken off the subtotal:
 *
 *     subtotal (Σ finalPrice × qty) − couponDiscount + shipping = total
 *
 * `mrpTotal` and `discount` sit outside that sum. They describe the same money
 * from the other side and must never be read as a row still to come.
 */

/** What a line contributes to the bill: the discounted price, times quantity. */
const lineTotal = (item) => round(item.finalPrice * item.quantity);

/**
 * The amount a coupon is measured against — the billable subtotal, nothing else.
 * Callers price coupons through this so `minOrderAmount` and a percentage
 * discount can never be computed on a basket wider than the one being charged.
 */
const eligibleSubtotal = (items) => round(items.reduce((sum, i) => sum + i.finalPrice * i.quantity, 0));

/**
 * The single source of truth for money. Cart totals, checkout summaries and the
 * order document all call this so a shopper can never be charged a client-computed price.
 *
 * @param {Array<{finalPrice:number, price:number, quantity:number}>} items
 * @param {{couponDiscount?:number, shippingRate?:number,
 *          freeShippingThreshold?:number}} [opts]
 */
function calculateTotals(items, opts = {}) {
  const {
    couponDiscount = 0,
    shippingRate = env.commerce.shippingFlatRate,
    freeShippingThreshold = env.commerce.freeShippingThreshold,
  } = opts;

  // Billed from the discounted price; the MRP only rides along for display.
  const subtotal = eligibleSubtotal(items);
  const mrpTotal = round(items.reduce((sum, i) => sum + i.price * i.quantity, 0));
  const productDiscount = round(mrpTotal - subtotal);

  // Coupon can never exceed the payable subtotal.
  const appliedCoupon = Math.min(round(couponDiscount), subtotal);
  const payableAmount = round(subtotal - appliedCoupon);

  const shipping = items.length === 0 || payableAmount >= freeShippingThreshold ? 0 : shippingRate;
  const total = round(payableAmount + shipping);

  return {
    itemCount: items.reduce((sum, i) => sum + i.quantity, 0),
    /** Display only — the pre-discount original, struck through beside the subtotal. */
    mrpTotal,
    /** Display only — how much of the MRP the product discount already took off. */
    discount: productDiscount,
    /** Σ discounted price × quantity. The base of the bill and of the coupon. */
    subtotal,
    /** The one deduction, applied to `subtotal`. */
    couponDiscount: appliedCoupon,
    shipping: round(shipping),
    freeShippingThreshold,
    amountForFreeShipping: shipping > 0 ? round(freeShippingThreshold - payableAmount) : 0,
    total,
    savings: round(productDiscount + appliedCoupon),
  };
}

module.exports = { calculateTotals, eligibleSubtotal, lineTotal, round };
