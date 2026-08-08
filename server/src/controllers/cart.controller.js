const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Cart, Product, Coupon } = require('../models');
const { calculateTotals, eligibleSubtotal, lineTotal } = require('../services/pricing.service');
const variantService = require('../services/variant.service');
const broadcast = require('../realtime/broadcast');

const POPULATE = [
  {
    path: 'items.product',
    select:
      'name slug price discountPercent finalPrice stock images status brand category subCategory hasVariants variantAttributes',
    populate: [
      { path: 'category', select: 'name slug' },
      { path: 'subCategory', select: 'name slug' },
    ],
  },
  // The chosen SKU carries the price, the stock and the imagery this line is billed on.
  {
    path: 'items.variant',
    select: 'sku attributes price discountPercent finalPrice stock isActive images weight dimensions',
  },
];

/**
 * The billing figures for one populated cart line, or null when the line cannot
 * be billed at all — saved for later, unpublished, its SKU gone, out of stock.
 *
 * Totals and coupons are both priced off this, so the basket a coupon is
 * measured against is always the exact basket being charged. Pricing them apart
 * once let an out-of-stock line — visible but never billed — inflate a
 * percentage discount and clear a `minOrderAmount` the payable cart never met.
 */
function billableLine(item) {
  const p = item.product;
  if (item.savedForLater || !p || p.status !== 'published') return null;

  const v = item.variant || null;
  if (p.hasVariants && (!v || !v.isActive)) return null;

  const stock = v ? v.stock : p.stock;
  if (stock <= 0) return null;

  return {
    price: v ? v.price : p.price,
    finalPrice: v ? v.finalPrice : p.finalPrice,
    // Out-of-stock lines stay visible but must not be billed; over-ordered ones
    // are billed for what actually exists.
    quantity: Math.min(item.quantity, stock),
  };
}

const billableLines = (cart) => (cart?.items || []).map(billableLine).filter(Boolean);

async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId }).populate(POPULATE);
  if (!cart) {
    cart = await Cart.create({ user: userId });
    cart = await Cart.findById(cart._id).populate(POPULATE);
  }
  return cart;
}

/**
 * Builds the API shape for a cart: drops items whose product was deleted/unpublished,
 * flags stock and price changes, and computes totals from live prices.
 *
 * For a line that carries a variant, *every* number comes from that SKU — its price, its
 * stock, its imagery. Two sizes of the same shirt are two independent lines that can be
 * priced and depleted separately.
 */
function serialiseCart(cart) {
  const removed = [];
  const items = [];
  const savedForLater = [];

  for (const item of cart.items) {
    const p = item.product;
    if (!p || p.status !== 'published') {
      removed.push(item.product?.name || 'An item');
      continue;
    }

    const variant = item.variant || null;
    // A variant that was deleted or deactivated leaves the line unsellable rather than
    // silently falling back to the parent's price, which would bill the wrong amount.
    if (p.hasVariants && (!variant || !variant.isActive)) {
      removed.push(`${p.name}${item.variantSku ? ` (${item.variantSku})` : ''}`);
      continue;
    }

    const price = variant ? variant.price : p.price;
    const finalPrice = variant ? variant.finalPrice : p.finalPrice;
    const discountPercent = variant ? variant.discountPercent : p.discountPercent;
    const stock = variant ? variant.stock : p.stock;

    const entry = {
      _id: item._id,
      product: p,
      variant: variant
        ? {
            _id: String(variant._id),
            sku: variant.sku,
            label: (variant.attributes || []).map((a) => a.value).join(' · '),
            attributes: (variant.attributes || []).map((a) => ({ name: a.name, value: a.value })),
            images: variant.images || [],
            price: variant.price,
            finalPrice: variant.finalPrice,
            discountPercent: variant.discountPercent,
            stock: variant.stock,
          }
        : null,
      variantSku: item.variantSku || variant?.sku || null,
      // Falls back to the parent gallery when the SKU has no photography of its own.
      image: variant?.images?.[0]?.url || p.images?.find((i) => i.isPrimary)?.url || p.images?.[0]?.url || null,
      price,
      finalPrice,
      discountPercent,
      quantity: item.quantity,
      priceAtAdd: item.priceAtAdd,
      // Surfaced in the UI as "price dropped/increased since you added this".
      priceChanged: Math.abs(finalPrice - item.priceAtAdd) > 0.009,
      // Billed from the discounted price. The MRP above is the struck-through original.
      lineTotal: lineTotal({ finalPrice, quantity: item.quantity }),
      inStock: stock > 0,
      stock,
      maxQuantity: Math.min(stock, 10),
      quantityExceedsStock: item.quantity > stock,
    };

    if (item.savedForLater) savedForLater.push(entry);
    else items.push(entry);
  }

  const totals = calculateTotals(billableLines(cart), {
    couponDiscount: cart.coupon?.discountAmount || 0,
  });

  return {
    items,
    savedForLater,
    coupon: cart.coupon?.code ? cart.coupon : null,
    totals,
    removedItems: removed,
    hasUnavailableItems: items.some((i) => !i.inStock || i.quantityExceedsStock),
  };
}

/** Re-price a stored coupon (the basket may have changed since it was applied). */
async function refreshCoupon(cart, userId) {
  if (!cart.coupon?.couponId) return;

  const coupon = await Coupon.findById(cart.coupon.couponId);
  const subtotal = eligibleSubtotal(billableLines(cart));

  const check = coupon?.check({ userId, subtotal });
  if (!coupon || !check?.valid) {
    cart.coupon = undefined;
  } else {
    cart.coupon.discountAmount = coupon.computeDiscount(subtotal);
  }
  await cart.save();
}

/**
 * Answers the caller and pushes the same cart to the shopper's other tabs and
 * devices. The originating socket ignores its own echo, so the tab that made the
 * change keeps the response it already rendered.
 */
function sendCart(req, res, cart, { message, statusCode } = {}) {
  broadcast.cartUpdated(req.user._id, cart, { originSocketId: req.get('x-socket-id') });
  return sendSuccess(res, { statusCode, message, data: { cart } });
}

/* ------------------------------------------------------------------ */

/** GET /cart */
exports.getCart = asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user._id);
  await refreshCoupon(cart, req.user._id);
  return sendSuccess(res, { message: 'Cart fetched', data: { cart: serialiseCart(cart) } });
});

/** POST /cart/items  { productId, variantId, quantity } */
exports.addItem = asyncHandler(async (req, res) => {
  const { productId, variantId = null, quantity = 1 } = req.body;

  const product = await Product.findById(productId);
  if (!product || product.status !== 'published') throw ApiError.notFound('Product not available');

  // Throws a shopper-readable message when the product needs a choice and none was made.
  const variant = await variantService.resolveVariant(product, variantId);

  const available = variant ? variant.stock : product.stock;
  const unitPrice = variant ? variant.finalPrice : product.finalPrice;
  const label = variant ? `"${product.name}" (${variant.label})` : 'This product';

  if (available <= 0) throw ApiError.badRequest(`${label} is out of stock`);

  const cart = (await Cart.findOne({ user: req.user._id })) || (await Cart.create({ user: req.user._id }));
  // Line identity is product + variant: Black/M and Blue/L never merge into one row.
  const existing = cart.items.find(
    (i) => String(i.product) === String(productId) && String(i.variant || '') === String(variant?._id || '')
  );

  const desired = (existing && !existing.savedForLater ? existing.quantity : 0) + Number(quantity);
  if (desired > available) {
    throw ApiError.badRequest(`Only ${available} unit(s) of ${label.toLowerCase()} left in stock`);
  }
  if (desired > 10) throw ApiError.badRequest('You can order at most 10 units of a product');

  if (existing) {
    existing.quantity = desired;
    existing.savedForLater = false;
    existing.priceAtAdd = unitPrice;
  } else {
    cart.items.push({
      product: productId,
      variant: variant?._id || null,
      variantSku: variant?.sku || null,
      quantity: Number(quantity),
      priceAtAdd: unitPrice,
    });
  }
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(POPULATE);
  await refreshCoupon(populated, req.user._id);

  return sendCart(req, res, serialiseCart(populated), {
    statusCode: 201,
    message: 'Added to cart',
  });
});

/** PATCH /cart/items/:itemId  { quantity } */
exports.updateItem = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) throw ApiError.notFound('Cart not found');

  const item = cart.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not found in your cart');

  const product = await Product.findById(item.product).select('stock name hasVariants variantAttributes');
  if (!product) throw ApiError.notFound('Product no longer exists');

  // Stock is checked against the exact SKU on the line, not the product's total.
  const variant = item.variant ? await variantService.resolveVariant(product, item.variant) : null;
  const available = variant ? variant.stock : product.stock;

  if (quantity > available) {
    throw ApiError.badRequest(
      `Only ${available} unit(s)${variant ? ` of "${variant.label}"` : ''} left in stock`
    );
  }

  item.quantity = quantity;
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(POPULATE);
  await refreshCoupon(populated, req.user._id);

  return sendCart(req, res, serialiseCart(populated), { message: 'Cart updated' });
});

/**
 * PATCH /cart/items/:itemId/variant  { variantId }
 * Swaps the chosen SKU in place — "actually, make that a Large" — without losing the row.
 * If the target SKU is already in the cart the two lines are merged.
 */
exports.changeItemVariant = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) throw ApiError.notFound('Cart not found');

  const item = cart.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not found in your cart');

  const product = await Product.findById(item.product).select('name status hasVariants variantAttributes');
  if (!product || product.status !== 'published') throw ApiError.notFound('Product not available');

  const variant = await variantService.resolveVariant(product, req.body.variantId, {
    requireStock: item.quantity,
  });
  if (!variant) throw ApiError.badRequest('This product does not have variants');

  const duplicate = cart.items.find(
    (i) => i._id.toString() !== item._id.toString() &&
      String(i.product) === String(item.product) &&
      String(i.variant || '') === String(variant._id)
  );

  if (duplicate) {
    const merged = Math.min(duplicate.quantity + item.quantity, variant.stock, 10);
    duplicate.quantity = merged;
    duplicate.savedForLater = false;
    item.deleteOne();
  } else {
    item.variant = variant._id;
    item.variantSku = variant.sku;
    item.priceAtAdd = variant.finalPrice;
  }
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(POPULATE);
  await refreshCoupon(populated, req.user._id);

  return sendCart(req, res, serialiseCart(populated), { message: `Switched to ${variant.label}` });
});

/** DELETE /cart/items/:itemId */
exports.removeItem = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) throw ApiError.notFound('Cart not found');

  const item = cart.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not found in your cart');

  item.deleteOne();
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(POPULATE);
  await refreshCoupon(populated, req.user._id);

  return sendCart(req, res, serialiseCart(populated), { message: 'Item removed' });
});

/** PATCH /cart/items/:itemId/save-for-later  { savedForLater } */
exports.toggleSaveForLater = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart) throw ApiError.notFound('Cart not found');

  const item = cart.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not found in your cart');

  item.savedForLater = req.body.savedForLater ?? !item.savedForLater;
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(POPULATE);
  await refreshCoupon(populated, req.user._id);

  return sendCart(req, res, serialiseCart(populated), {
    message: item.savedForLater ? 'Saved for later' : 'Moved to cart',
  });
});

/** DELETE /cart */
exports.clearCart = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (cart) {
    cart.items = [];
    cart.coupon = undefined;
    await cart.save();
  }
  const populated = await Cart.findById(cart?._id).populate(POPULATE);
  return sendCart(req, res, populated ? serialiseCart(populated) : null, {
    message: 'Cart cleared',
  });
});

/** POST /cart/coupon  { code } */
exports.applyCoupon = asyncHandler(async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();

  const cart = await Cart.findOne({ user: req.user._id }).populate(POPULATE);
  // Nothing billable means nothing for a coupon to come off — a cart holding only
  // out-of-stock lines is as empty as an empty one, as far as money goes.
  const billable = cart ? billableLines(cart) : [];
  if (!billable.length) throw ApiError.badRequest('Your cart is empty');

  const coupon = await Coupon.findOne({ code });
  if (!coupon) throw ApiError.notFound('Invalid coupon code');

  const subtotal = eligibleSubtotal(billable);

  const check = coupon.check({ userId: req.user._id, subtotal });
  if (!check.valid) throw ApiError.badRequest(check.reason);

  cart.coupon = {
    code: coupon.code,
    couponId: coupon._id,
    discountAmount: coupon.computeDiscount(subtotal),
  };
  await cart.save();

  return sendCart(req, res, serialiseCart(cart), { message: `Coupon ${coupon.code} applied` });
});

/** DELETE /cart/coupon */
exports.removeCoupon = asyncHandler(async (req, res) => {
  const cart = await Cart.findOne({ user: req.user._id });
  if (cart) {
    cart.coupon = undefined;
    await cart.save();
  }
  const populated = await Cart.findById(cart?._id).populate(POPULATE);
  return sendCart(req, res, populated ? serialiseCart(populated) : null, {
    message: 'Coupon removed',
  });
});

/**
 * POST /cart/merge — folds a guest cart (kept in localStorage) into the account
 * cart right after login.
 */
exports.mergeGuestCart = asyncHandler(async (req, res) => {
  const guestItems = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  const cart = (await Cart.findOne({ user: req.user._id })) || (await Cart.create({ user: req.user._id }));

  for (const guest of guestItems) {
    const product = await Product.findById(guest.productId).select(
      'stock finalPrice status hasVariants variantAttributes'
    );
    if (!product || product.status !== 'published' || product.stock <= 0) continue;

    // A guest line that lost its variant (or never had one for a varied product) is
    // skipped rather than guessed at — merging is silent, so it must never mis-pick a SKU.
    let variant = null;
    if (product.hasVariants) {
      variant = await variantService.resolveVariant(product, guest.variantId).catch(() => null);
      if (!variant || variant.stock <= 0) continue;
    } else if (guest.variantId) {
      continue;
    }

    const existing = cart.items.find(
      (i) => String(i.product) === String(guest.productId) &&
        String(i.variant || '') === String(variant?._id || '')
    );
    const qty = Math.min(
      Number(guest.quantity) || 1,
      variant ? variant.stock : product.stock,
      10 - (existing?.quantity || 0)
    );
    if (qty <= 0) continue;

    if (existing) existing.quantity += qty;
    else {
      cart.items.push({
        product: guest.productId,
        variant: variant?._id || null,
        variantSku: variant?.sku || null,
        quantity: qty,
        priceAtAdd: variant ? variant.finalPrice : product.finalPrice,
      });
    }
  }
  await cart.save();

  const populated = await Cart.findById(cart._id).populate(POPULATE);
  return sendCart(req, res, serialiseCart(populated), { message: 'Cart merged' });
});

exports.serialiseCart = serialiseCart;
exports.CART_POPULATE = POPULATE;
