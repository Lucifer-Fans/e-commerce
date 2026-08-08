/**
 * A placed order's stored `pricing`, in the shape the live cart's `totals` use,
 * so `PriceSummary` can render an order exactly as it rendered the cart it came
 * from. One component, one row order, one arithmetic — the breakdown a shopper
 * approved at checkout is the breakdown they see afterwards.
 */
export function orderTotals(order) {
  const p = order?.pricing || {};
  const discount = p.discount || 0;
  const couponDiscount = p.couponDiscount || 0;

  return {
    itemCount: (order?.items || []).reduce((sum, i) => sum + i.quantity, 0),
    // Orders placed before `mrpTotal` was stored still carry the gap it came from.
    mrpTotal: p.mrpTotal || (p.subtotal || 0) + discount,
    subtotal: p.subtotal || 0,
    discount,
    couponDiscount,
    shipping: p.shipping || 0,
    total: p.total || 0,
    savings: discount + couponDiscount,
    // A placed order is past the point of being nudged toward free delivery.
    amountForFreeShipping: 0,
  };
}
