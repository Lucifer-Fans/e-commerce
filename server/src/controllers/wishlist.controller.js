const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Wishlist, Product, Cart } = require('../models');
const { LIST_FIELDS } = require('./product.controller');
const variantService = require('../services/variant.service');
const broadcast = require('../realtime/broadcast');

const POPULATE = [
  {
    path: 'products.product',
    select: LIST_FIELDS,
    populate: { path: 'category', select: 'name slug' },
  },
  // Saving "the blue one in L" means the card shows that SKU's price, stock and photo.
  {
    path: 'products.variant',
    select: 'sku attributes price discountPercent finalPrice stock isActive images',
  },
];

async function getOrCreate(userId) {
  let list = await Wishlist.findOne({ user: userId }).populate(POPULATE);
  if (!list) {
    list = await Wishlist.create({ user: userId });
    list = await Wishlist.findById(list._id).populate(POPULATE);
  }
  return list;
}

const serialise = (list) => ({
  items: list.products
    .filter((entry) => entry.product && entry.product.status === 'published')
    .map((entry) => ({
      product: entry.product,
      variant: entry.variant ? variantService.publicVariant(entry.variant) : null,
      variantSku: entry.variantSku || entry.variant?.sku || null,
      addedAt: entry.addedAt,
    })),
  count: list.products.length,
});

/** GET /wishlist */
exports.getWishlist = asyncHandler(async (req, res) => {
  const list = await getOrCreate(req.user._id);
  return sendSuccess(res, { message: 'Wishlist fetched', data: { wishlist: serialise(list) } });
});

/** GET /wishlist/ids — cheap payload so product cards can render their heart state. */
exports.getWishlistIds = asyncHandler(async (req, res) => {
  const list = await Wishlist.findOne({ user: req.user._id }).select('products.product').lean();
  return sendSuccess(res, {
    message: 'Wishlist ids fetched',
    data: { ids: (list?.products || []).map((p) => String(p.product)) },
  });
});

/**
 * POST /wishlist  { productId, variantId? }
 *
 * The wishlist stays keyed by product — one heart per product, exactly as the storefront
 * has always behaved — but it remembers which SKU the shopper was looking at, so moving it
 * to the cart later restores that exact option instead of asking again. Re-saving with a
 * different option updates the remembered SKU rather than creating a second entry.
 */
exports.addToWishlist = asyncHandler(async (req, res) => {
  const { productId, variantId = null } = req.body;

  const product = await Product.findById(productId).select('status hasVariants variantAttributes name');
  if (!product || product.status !== 'published') throw ApiError.notFound('Product not available');

  // A missing option is fine here: saving for later is not a purchase, so the shopper is
  // allowed to decide the size when they move it to the cart.
  const variant = variantId ? await variantService.resolveVariant(product, variantId) : null;

  const list = (await Wishlist.findOne({ user: req.user._id })) ||
    (await Wishlist.create({ user: req.user._id }));

  const existing = list.products.find((p) => String(p.product) === String(productId));
  if (existing) {
    if (!variant || String(existing.variant || '') === String(variant._id)) {
      throw ApiError.conflict('This product is already in your wishlist');
    }
    existing.variant = variant._id;
    existing.variantSku = variant.sku;
  } else {
    list.products.unshift({
      product: productId,
      variant: variant?._id || null,
      variantSku: variant?.sku || null,
    });
  }
  await list.save();

  const populated = await Wishlist.findById(list._id).populate(POPULATE);
  const wishlist = serialise(populated);
  broadcast.wishlistUpdated(req.user._id, wishlist, { originSocketId: req.get('x-socket-id') });

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Added to wishlist',
    data: { wishlist },
  });
});

/** DELETE /wishlist/:productId */
exports.removeFromWishlist = asyncHandler(async (req, res) => {
  const list = await Wishlist.findOne({ user: req.user._id });
  if (!list) throw ApiError.notFound('Wishlist not found');

  const before = list.products.length;
  list.products = list.products.filter((p) => String(p.product) !== String(req.params.productId));
  if (list.products.length === before) throw ApiError.notFound('Product is not in your wishlist');

  await list.save();
  const populated = await Wishlist.findById(list._id).populate(POPULATE);
  const wishlist = serialise(populated);
  broadcast.wishlistUpdated(req.user._id, wishlist, { originSocketId: req.get('x-socket-id') });

  return sendSuccess(res, {
    message: 'Removed from wishlist',
    data: { wishlist },
  });
});

/** POST /wishlist/:productId/move-to-cart  { variantId? } */
exports.moveToCart = asyncHandler(async (req, res) => {
  const { productId } = req.params;

  const product = await Product.findById(productId).select(
    'stock finalPrice status name hasVariants variantAttributes'
  );
  if (!product || product.status !== 'published') throw ApiError.notFound('Product not available');
  if (product.stock <= 0) throw ApiError.badRequest('This product is out of stock');

  // The option the shopper picks now wins; otherwise fall back to the one they saved.
  const list = await Wishlist.findOne({ user: req.user._id }).select('products');
  const saved = list?.products.find((p) => String(p.product) === String(productId));
  const variant = await variantService.resolveVariant(
    product,
    req.body?.variantId || saved?.variant || null,
    { requireStock: 1 }
  );

  const available = variant ? variant.stock : product.stock;
  const unitPrice = variant ? variant.finalPrice : product.finalPrice;

  const cart = (await Cart.findOne({ user: req.user._id })) || (await Cart.create({ user: req.user._id }));
  const existing = cart.items.find(
    (i) => String(i.product) === String(productId) && String(i.variant || '') === String(variant?._id || '')
  );
  if (existing) {
    existing.quantity = Math.min(existing.quantity + 1, available, 10);
    existing.savedForLater = false;
  } else {
    cart.items.push({
      product: productId,
      variant: variant?._id || null,
      variantSku: variant?.sku || null,
      quantity: 1,
      priceAtAdd: unitPrice,
    });
  }
  await cart.save();

  await Wishlist.updateOne({ user: req.user._id }, { $pull: { products: { product: productId } } });

  // Both lists changed, and the mover's own tab needs the new cart too — so unlike
  // the other handlers this one deliberately does not suppress the origin echo.
  broadcast.wishlistUpdated(req.user._id, null);
  broadcast.cartUpdated(req.user._id, null);

  return sendSuccess(res, { message: 'Moved to cart' });
});

/** DELETE /wishlist */
exports.clearWishlist = asyncHandler(async (req, res) => {
  await Wishlist.updateOne({ user: req.user._id }, { products: [] });
  broadcast.wishlistUpdated(req.user._id, { items: [], count: 0 }, {
    originSocketId: req.get('x-socket-id'),
  });

  return sendSuccess(res, { message: 'Wishlist cleared' });
});
