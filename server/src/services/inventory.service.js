const { Product, ProductVariant } = require('../models');

/**
 * The one place stock moves.
 *
 * Inventory always moves on the exact unit that was sold. For a varied product the SKU row
 * is the authority — its `stock` is what gates the sale — while the parent product's rollup
 * is moved by the same amount so every list, filter, card and dashboard tile that reads
 * `Product.stock` stays correct without a recount. For an un-varied product the product row
 * is the authority, exactly as it always was.
 *
 * Both functions take an order/cart line: `{ product, variant, quantity }`.
 */

/**
 * Conditionally reserves stock. Returns false — rather than throwing — when the units are
 * no longer there, so the caller can roll back the lines it already took and report which
 * SKU ran out.
 */
async function reserveStock(item, opts = {}) {
  if (item.variant) {
    const result = await ProductVariant.updateOne(
      { _id: item.variant, stock: { $gte: item.quantity }, isActive: true },
      { $inc: { stock: -item.quantity, soldCount: item.quantity } },
      opts
    );
    if (result.matchedCount === 0) return false;

    await Product.updateOne(
      { _id: item.product },
      { $inc: { stock: -item.quantity, soldCount: item.quantity } },
      opts
    );
    return true;
  }

  const result = await Product.updateOne(
    { _id: item.product, stock: { $gte: item.quantity } },
    { $inc: { stock: -item.quantity, soldCount: item.quantity } },
    opts
  );
  return result.matchedCount !== 0;
}

/** The exact inverse — cancellations, returns, refunds and failed-order rollbacks. */
async function releaseStock(item, opts = {}) {
  if (item.variant) {
    await ProductVariant.updateOne(
      { _id: item.variant },
      { $inc: { stock: item.quantity, soldCount: -item.quantity } },
      opts
    );
  }
  await Product.updateOne(
    { _id: item.product },
    { $inc: { stock: item.quantity, soldCount: -item.quantity } },
    opts
  );
}

module.exports = { reserveStock, releaseStock };
