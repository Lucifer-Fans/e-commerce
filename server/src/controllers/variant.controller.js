const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Product, ProductVariant } = require('../models');
const variantService = require('../services/variant.service');
const broadcast = require('../realtime/broadcast');

/**
 * Variant (SKU) management.
 *
 * Reads are public — the storefront selector needs every combination, including the
 * unavailable ones, because those stay visible and disabled rather than hidden.
 * Writes are admin-only and always end by resyncing the parent product's rollup.
 */

async function loadProduct(productId) {
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

/* ------------------------------------------------------------------ *
 * Public
 * ------------------------------------------------------------------ */

/** GET /products/:productId/variants */
exports.listVariants = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId).select(
    'status variantAttributes hasVariants variantSummary'
  );
  if (!product) throw ApiError.notFound('Product not found');
  if (product.status !== 'published' && req.user?.role !== 'admin') {
    throw ApiError.notFound('Product not found');
  }

  const variants = await variantService.listPublicVariants(product._id);

  return sendSuccess(res, {
    message: 'Variants fetched',
    data: {
      attributes: product.variantAttributes || [],
      variants,
      summary: product.variantSummary,
    },
  });
});

/* ------------------------------------------------------------------ *
 * Admin
 * ------------------------------------------------------------------ */

/**
 * PATCH /products/:productId/variant-attributes (admin)
 * Defines the axes of variation. Existing SKUs are left alone — removing a value here does
 * not silently delete the stock sitting behind it; the generate/reconcile step does that
 * explicitly so the admin sees what they are dropping.
 */
exports.updateVariantAttributes = asyncHandler(async (req, res) => {
  const product = await loadProduct(req.params.productId);

  product.variantAttributes = variantService.normaliseAttributeDefinitions(req.body.attributes || []);
  await product.save();
  await variantService.syncProductAggregates(product._id);

  broadcast.variantsChanged('attributes', product);

  return sendSuccess(res, {
    message: 'Variant attributes saved',
    data: { attributes: product.variantAttributes },
  });
});

/**
 * POST /products/:productId/variants/generate (admin)
 *
 * Builds every combination the attribute definition implies. Combinations that already
 * exist keep their SKU, price, stock and images — regenerating after adding one new colour
 * must never reset the inventory of the other twenty SKUs.
 */
exports.generateVariants = asyncHandler(async (req, res) => {
  const product = await loadProduct(req.params.productId);

  const attributes = req.body.attributes
    ? variantService.normaliseAttributeDefinitions(req.body.attributes)
    : product.variantAttributes;

  if (!attributes?.length) {
    throw ApiError.badRequest('Define at least one attribute with one value first');
  }

  if (req.body.attributes) {
    product.variantAttributes = attributes;
    await product.save();
  }

  const combinations = variantService.generateCombinations(attributes);
  const existing = await ProductVariant.find({ product: product._id }).lean();
  const byKey = new Map(existing.map((v) => [v.attributeKey, v]));

  const defaults = {
    price: Number(req.body.price ?? product.price) || 0,
    discountPercent: Number(req.body.discountPercent ?? product.discountPercent) || 0,
    stock: Number(req.body.stock ?? 0) || 0,
    lowStockThreshold: Number(req.body.lowStockThreshold ?? product.lowStockThreshold) || 5,
  };

  const rows = combinations.map((attrs, index) => {
    const found = byKey.get(variantService.buildAttributeKey(attrs));
    if (found) {
      return {
        _id: found._id,
        attributes: attrs,
        sku: found.sku,
        price: found.price,
        discountPercent: found.discountPercent,
        stock: found.stock,
        lowStockThreshold: found.lowStockThreshold,
        images: found.images,
        weight: found.weight,
        dimensions: found.dimensions,
        barcode: found.barcode,
        hsnCode: found.hsnCode,
        isActive: found.isActive,
        isDefault: found.isDefault,
        displayOrder: index,
      };
    }
    return { attributes: attrs, ...defaults, isActive: true, displayOrder: index };
  });

  // `removeMissing: false` — generating is additive. Deleting a SKU stays an explicit act.
  const variants = await variantService.reconcileVariants(product, rows, { removeMissing: false });
  const fresh = await Product.findById(product._id).lean({ virtuals: true });

  broadcast.variantsChanged('generated', fresh);

  return sendSuccess(res, {
    statusCode: 201,
    message: `${combinations.length} combination(s) ready · ${combinations.length - existing.length > 0 ? combinations.length - existing.length : 0} new`,
    data: {
      variants: variants.map(variantService.publicVariant),
      attributes: product.variantAttributes,
      summary: fresh.variantSummary,
    },
  });
});

/**
 * PUT /products/:productId/variants (admin) — replaces the whole set.
 * This is what the product wizard submits: one payload, one reconciliation.
 */
exports.replaceVariants = asyncHandler(async (req, res) => {
  const product = await loadProduct(req.params.productId);

  if (Array.isArray(req.body.attributes)) {
    product.variantAttributes = variantService.normaliseAttributeDefinitions(req.body.attributes);
    await product.save();
  }

  const variants = await variantService.reconcileVariants(product, req.body.variants || []);
  const fresh = await Product.findById(product._id).lean({ virtuals: true });

  broadcast.variantsChanged('replaced', fresh);
  broadcast.stockChanged([{ product: product._id }], { reason: 'variants_updated' });

  return sendSuccess(res, {
    message: 'Variants saved',
    data: {
      variants: variants.map(variantService.publicVariant),
      attributes: product.variantAttributes,
      summary: fresh.variantSummary,
    },
  });
});

/** POST /products/:productId/variants (admin) — one extra combination. */
exports.createVariant = asyncHandler(async (req, res) => {
  const product = await loadProduct(req.params.productId);

  const all = await variantService.reconcileVariants(product, [req.body], { removeMissing: false });
  const key = variantService.buildAttributeKey(req.body.attributes || []);
  const variant = all.find((v) => v.attributeKey === key);

  if (!variant) throw ApiError.badRequest('Could not create that combination');

  const fresh = await Product.findById(product._id).lean({ virtuals: true });
  broadcast.variantsChanged('created', fresh);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Variant created',
    data: { variant: variantService.publicVariant(variant) },
  });
});

/** PATCH /variants/:id (admin) — price, stock, images and metadata of one SKU. */
exports.updateVariant = asyncHandler(async (req, res) => {
  const variant = await ProductVariant.findById(req.params.id);
  if (!variant) throw ApiError.notFound('Variant not found');

  const product = await loadProduct(variant.product);

  const payload = { ...req.body, _id: variant._id, attributes: variant.attributes };
  delete payload.finalPrice; // always derived
  delete payload.soldCount;

  // Fall back to the stored values for anything the caller left out — this is a PATCH.
  const merged = {
    ...variant.toObject(),
    ...payload,
    attributes: variant.attributes,
  };

  const all = await variantService.reconcileVariants(product, [merged], { removeMissing: false });
  const updated = all.find((v) => String(v._id) === String(variant._id));

  const fresh = await Product.findById(product._id).lean({ virtuals: true });
  broadcast.variantsChanged('updated', fresh);
  broadcast.stockChanged([{ product: product._id }], { reason: 'variant_updated' });

  return sendSuccess(res, {
    message: 'Variant updated',
    data: { variant: variantService.publicVariant(updated || variant) },
  });
});

/** PATCH /variants/:id/stock (admin) — the quick inventory adjustment. */
exports.updateVariantStock = asyncHandler(async (req, res) => {
  const variant = await ProductVariant.findByIdAndUpdate(
    req.params.id,
    { stock: req.body.stock },
    { new: true, runValidators: true }
  );
  if (!variant) throw ApiError.notFound('Variant not found');

  await variantService.syncProductAggregates(variant.product);
  broadcast.stockChanged([{ product: variant.product }], { reason: 'admin_adjustment' });

  return sendSuccess(res, {
    message: 'Stock updated',
    data: { variant: variantService.publicVariant(variant) },
  });
});

/** DELETE /variants/:id (admin) */
exports.deleteVariant = asyncHandler(async (req, res) => {
  const variant = await ProductVariant.findById(req.params.id);
  if (!variant) throw ApiError.notFound('Variant not found');

  const productId = variant.product;
  await variant.deleteOne();
  await variantService.syncProductAggregates(productId);

  const fresh = await Product.findById(productId).lean({ virtuals: true });
  broadcast.variantsChanged('deleted', fresh);

  return sendSuccess(res, { message: 'Variant deleted', data: { summary: fresh?.variantSummary } });
});

/**
 * GET /variants/admin/low-stock (admin) — per-SKU inventory alerts. A product can look
 * healthy on 200 units and still be unsellable in size L; this is the view that shows it.
 */
exports.getLowStockVariants = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 20);

  const variants = await ProductVariant.find({
    isActive: true,
    $expr: { $lte: ['$stock', '$lowStockThreshold'] },
  })
    .populate({ path: 'product', select: 'name slug status images' })
    .sort({ stock: 1 })
    .limit(limit)
    .lean({ virtuals: true });

  return sendSuccess(res, {
    message: 'Low stock variants fetched',
    data: {
      variants: variants
        .filter((v) => v.product && v.product.status !== 'archived')
        .map((v) => ({
          _id: String(v._id),
          sku: v.sku,
          label: (v.attributes || []).map((a) => a.value).join(' · '),
          stock: v.stock,
          lowStockThreshold: v.lowStockThreshold,
          finalPrice: v.finalPrice,
          image: v.images?.[0]?.url || v.product.images?.[0]?.url || null,
          product: { _id: String(v.product._id), name: v.product.name, slug: v.product.slug },
        })),
    },
  });
});
