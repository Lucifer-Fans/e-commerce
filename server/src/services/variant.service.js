const slugify = require('slugify');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { destroyAsset } = require('../config/cloudinary');

/**
 * Everything that turns a set of attribute definitions into sellable SKUs, and everything
 * that keeps the parent product's rollup honest afterwards.
 *
 * The models are required lazily inside the functions: this service is pulled in by
 * controllers that models/index.js itself does not depend on, and eager requires here would
 * make the dependency graph order-sensitive.
 */

const MAX_COMBINATIONS = 500;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const toSlug = (value) => slugify(String(value || ''), { lower: true, strict: true });

/**
 * Canonical fingerprint of a combination. Sorted by attribute slug so that reordering the
 * attributes in the admin can never mint a "new" combination that already exists.
 */
function buildAttributeKey(attributes = []) {
  return attributes
    .map((a) => `${toSlug(a.slug || a.name)}:${toSlug(a.valueSlug || a.value)}`)
    .sort()
    .join('|');
}

/** "Black · M" — the label carts, orders, invoices and emails print. */
const variantLabel = (attributes = []) => attributes.map((a) => a.value).join(' · ');

/**
 * Normalises the admin's attribute definition: fills in slugs, drops blank values and
 * de-duplicates repeated labels so the generator can never emit two identical SKUs.
 */
function normaliseAttributeDefinitions(raw = []) {
  const seenAttribute = new Set();

  return raw
    .map((attribute, index) => {
      const name = String(attribute?.name || '').trim();
      if (!name) return null;

      const slug = toSlug(attribute.slug || name);
      if (!slug || seenAttribute.has(slug)) return null;
      seenAttribute.add(slug);

      const seenValue = new Set();
      const values = (attribute.values || [])
        .map((value, valueIndex) => {
          const label = String(value?.label ?? value ?? '').trim();
          if (!label) return null;

          const valueSlug = toSlug(value?.slug || label);
          if (!valueSlug || seenValue.has(valueSlug)) return null;
          seenValue.add(valueSlug);

          return {
            label,
            slug: valueSlug,
            hex: value?.hex?.trim() || undefined,
            image: value?.image?.url ? { url: value.image.url, publicId: value.image.publicId } : undefined,
            displayOrder: Number.isFinite(value?.displayOrder) ? value.displayOrder : valueIndex,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.displayOrder - b.displayOrder);

      return {
        name,
        slug,
        inputType: ['auto', 'chip', 'swatch', 'image'].includes(attribute.inputType)
          ? attribute.inputType
          : 'auto',
        helpText: attribute.helpText?.trim() || undefined,
        values,
        displayOrder: Number.isFinite(attribute?.displayOrder) ? attribute.displayOrder : index,
      };
    })
    .filter((attribute) => attribute && attribute.values.length > 0)
    .sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Cartesian product of the attribute values — every combination the admin's definition
 * implies, in a stable order (first attribute varies slowest, exactly how the admin grid
 * and the storefront selector read).
 */
function generateCombinations(attributes = []) {
  const defs = normaliseAttributeDefinitions(attributes);
  if (!defs.length) return [];

  const total = defs.reduce((product, attribute) => product * attribute.values.length, 1);
  if (total > MAX_COMBINATIONS) {
    throw ApiError.badRequest(
      `That would create ${total} combinations. Split the product or reduce the values — the limit is ${MAX_COMBINATIONS}.`
    );
  }

  return defs.reduce(
    (rows, attribute) =>
      rows.flatMap((row) =>
        attribute.values.map((value) => [
          ...row,
          {
            name: attribute.name,
            slug: attribute.slug,
            value: value.label,
            valueSlug: value.slug,
            displayOrder: attribute.displayOrder,
          },
        ])
      ),
    [[]]
  );
}

/**
 * Deterministic, readable SKU: `<base>-<value slugs>`. The base is the product's own SKU
 * when it has one, otherwise a compaction of its name. Collisions across products (two
 * products both called "Cotton Tee") are broken with a short suffix rather than by failing.
 */
function buildSkuCandidate(baseSku, attributes) {
  const tail = attributes
    .map((a) => toSlug(a.valueSlug || a.value).replace(/-/g, '').slice(0, 8))
    .join('-')
    .toUpperCase();
  return `${baseSku}-${tail}`.slice(0, 64);
}

function productSkuBase(product) {
  const raw = product.sku || product.slug || product.name || 'SKU';
  const compact = toSlug(raw).replace(/-/g, '').toUpperCase();
  return (compact || 'SKU').slice(0, 16);
}

/** Reserves a unique SKU, consulting both the database and the SKUs minted in this batch. */
async function uniqueSku(candidate, { taken, ignoreId } = {}) {
  const ProductVariant = mongoose.model('ProductVariant');
  let sku = candidate.toUpperCase();
  let attempt = 0;

  /* eslint-disable no-await-in-loop */
  while (attempt < 50) {
    const clashesInBatch = taken?.has(sku);
    const clashesInDb =
      !clashesInBatch &&
      (await ProductVariant.exists({
        sku,
        ...(ignoreId ? { _id: { $ne: ignoreId } } : {}),
      }));

    if (!clashesInBatch && !clashesInDb) {
      taken?.add(sku);
      return sku;
    }
    attempt += 1;
    sku = `${candidate}-${attempt + 1}`.slice(0, 64).toUpperCase();
  }
  /* eslint-enable no-await-in-loop */

  throw ApiError.conflict('Could not allocate a unique SKU — set one manually.');
}

/**
 * Recomputes the parent product's rollup from its variants.
 *
 * This is what lets the entire pre-existing catalogue keep working untouched: `stock`,
 * `price`, `discountPercent` and `finalPrice` on the product stay meaningful, so every
 * existing filter, sort, search, homepage rail and dashboard tile behaves exactly as before
 * — they simply now describe "the cheapest available variant" and "stock across all SKUs".
 */
async function syncProductAggregates(productId) {
  const Product = mongoose.model('Product');
  const ProductVariant = mongoose.model('ProductVariant');

  const product = await Product.findById(productId);
  if (!product) return null;

  const variants = await ProductVariant.find({ product: productId })
    .select('price discountPercent finalPrice stock isActive')
    .lean();

  if (!variants.length) {
    product.hasVariants = false;
    product.variantSummary = {
      count: 0,
      activeCount: 0,
      inStockCount: 0,
      minPrice: 0,
      maxPrice: 0,
      minMrp: 0,
      maxDiscountPercent: 0,
    };
    await product.save();
    return product;
  }

  const active = variants.filter((v) => v.isActive);
  // A product whose variants are all deactivated is out of stock, not un-varied.
  const pricingPool = active.length ? active : variants;

  const finals = pricingPool.map((v) => v.finalPrice ?? 0);
  const cheapest = pricingPool.reduce((best, v) => ((v.finalPrice ?? 0) < (best.finalPrice ?? 0) ? v : best));

  product.hasVariants = true;
  product.stock = active.reduce((sum, v) => sum + (v.stock || 0), 0);
  // The buy box and every card show the cheapest variant's pricing until one is picked.
  product.price = cheapest.price;
  product.discountPercent = cheapest.discountPercent || 0;
  product.variantSummary = {
    count: variants.length,
    activeCount: active.length,
    inStockCount: active.filter((v) => v.stock > 0).length,
    minPrice: round2(Math.min(...finals)),
    maxPrice: round2(Math.max(...finals)),
    minMrp: round2(Math.min(...pricingPool.map((v) => v.price ?? 0))),
    maxDiscountPercent: Math.max(...pricingPool.map((v) => v.discountPercent || 0)),
  };

  await product.save();
  return product;
}

/**
 * Reconciles a full set of variant rows sent by the admin against what is stored:
 * creates what is new, updates what changed, and deletes what was dropped (releasing its
 * Cloudinary assets). Returns the resulting variants.
 *
 * Rows are matched on `_id` when the admin edited an existing SKU, and otherwise on the
 * attribute fingerprint — so regenerating a matrix never orphans the stock an admin
 * already entered.
 */
async function reconcileVariants(product, rows = [], { removeMissing = true } = {}) {
  const ProductVariant = mongoose.model('ProductVariant');

  const existing = await ProductVariant.find({ product: product._id });
  const byId = new Map(existing.map((v) => [String(v._id), v]));
  const byKey = new Map(existing.map((v) => [v.attributeKey, v]));

  const base = productSkuBase(product);
  const takenSkus = new Set();
  const keptIds = new Set();
  const saved = [];

  for (const [index, row] of rows.entries()) {
    const attributes = (row.attributes || [])
      .map((a) => ({
        name: String(a.name || '').trim(),
        slug: toSlug(a.slug || a.name),
        value: String(a.value || '').trim(),
        valueSlug: toSlug(a.valueSlug || a.value),
        displayOrder: Number.isFinite(a.displayOrder) ? a.displayOrder : 0,
      }))
      .filter((a) => a.name && a.value);

    if (!attributes.length) continue;

    const attributeKey = buildAttributeKey(attributes);
    const target = (row._id && byId.get(String(row._id))) || byKey.get(attributeKey) || new ProductVariant();

    // Two submitted rows collapsing onto the same stored variant means the payload
    // contained a duplicate combination — reject rather than silently drop one.
    if (!target.isNew && keptIds.has(String(target._id))) {
      throw ApiError.badRequest(`Duplicate combination "${variantLabel(attributes)}" in the submitted variants`);
    }

    target.product = product._id;
    target.attributes = attributes;
    target.attributeKey = attributeKey;
    target.price = Number(row.price);
    target.discountPercent = Number(row.discountPercent) || 0;
    target.stock = Number(row.stock) || 0;
    target.lowStockThreshold = Number.isFinite(Number(row.lowStockThreshold))
      ? Number(row.lowStockThreshold)
      : (product.lowStockThreshold ?? 5);
    target.isActive = row.isActive !== false;
    target.isDefault = Boolean(row.isDefault);
    target.displayOrder = Number.isFinite(row.displayOrder) ? row.displayOrder : index;
    target.barcode = row.barcode?.trim() || undefined;
    target.hsnCode = row.hsnCode?.trim() || undefined;

    if (row.weight) target.weight = { value: Number(row.weight.value) || undefined, unit: row.weight.unit || 'g' };
    if (row.dimensions) {
      target.dimensions = {
        length: Number(row.dimensions.length) || undefined,
        width: Number(row.dimensions.width) || undefined,
        height: Number(row.dimensions.height) || undefined,
        unit: row.dimensions.unit || 'cm',
      };
    }

    if (Array.isArray(row.images)) {
      // Images the admin removed from this SKU are released from Cloudinary, but only if
      // no other variant or the parent product is still pointing at them.
      const keep = new Set(row.images.map((i) => i.publicId));
      const orphans = (target.images || []).filter((i) => !keep.has(i.publicId));
      const stillUsed = new Set([
        ...(product.images || []).map((i) => i.publicId),
        ...rows.flatMap((r) => (r.images || []).map((i) => i.publicId)),
      ]);
      await Promise.all(
        orphans
          .filter((i) => i.publicId && !stillUsed.has(i.publicId))
          .map((i) => destroyAsset(i.publicId).catch(() => {}))
      );

      target.images = row.images.map((image, imageIndex) => ({
        url: image.url,
        publicId: image.publicId,
        alt: image.alt || `${product.name} — ${variantLabel(attributes)}`,
        isPrimary: imageIndex === 0,
        displayOrder: imageIndex,
      }));
    }

    const requestedSku = String(row.sku || '').trim().toUpperCase();
    if (requestedSku && requestedSku !== target.sku) {
      target.sku = await uniqueSku(requestedSku, { taken: takenSkus, ignoreId: target.isNew ? null : target._id });
    } else if (!target.sku) {
      target.sku = await uniqueSku(buildSkuCandidate(base, attributes), { taken: takenSkus });
    } else {
      takenSkus.add(target.sku);
    }

    await target.save();
    keptIds.add(String(target._id));
    saved.push(target);
  }

  if (removeMissing) {
    const dropped = existing.filter((v) => !keptIds.has(String(v._id)));
    if (dropped.length) {
      const stillUsed = new Set([
        ...(product.images || []).map((i) => i.publicId),
        ...saved.flatMap((v) => (v.images || []).map((i) => i.publicId)),
      ]);
      await Promise.all(
        dropped.flatMap((v) =>
          (v.images || [])
            .filter((i) => i.publicId && !stillUsed.has(i.publicId))
            .map((i) => destroyAsset(i.publicId).catch(() => {}))
        )
      );
      await ProductVariant.deleteMany({ _id: { $in: dropped.map((v) => v._id) } });
    }
  }

  // Exactly one default, so the storefront always has a variant to preselect.
  if (saved.length) {
    const preferred =
      saved.find((v) => v.isDefault && v.isActive && v.stock > 0) ||
      saved.find((v) => v.isActive && v.stock > 0) ||
      saved.find((v) => v.isActive) ||
      saved[0];

    await ProductVariant.updateMany({ product: product._id }, { isDefault: false });
    await ProductVariant.updateOne({ _id: preferred._id }, { isDefault: true });
  }

  await syncProductAggregates(product._id);
  return ProductVariant.find({ product: product._id }).sort({ displayOrder: 1, createdAt: 1 });
}

/**
 * Resolves the variant a cart/order line refers to, with the checks every caller needs.
 * Throws with a shopper-readable message rather than returning null, because every call
 * site would otherwise repeat the same three error strings.
 */
async function resolveVariant(product, variantId, { requireStock = 0 } = {}) {
  const ProductVariant = mongoose.model('ProductVariant');

  if (!product.hasVariants) {
    if (variantId) throw ApiError.badRequest('This product does not have variants');
    return null;
  }

  if (!variantId) {
    throw ApiError.badRequest(`Please choose ${optionPrompt(product)} before adding "${product.name}" to your cart`);
  }
  if (!mongoose.isValidObjectId(variantId)) throw ApiError.badRequest('Invalid variant selected');

  const variant = await ProductVariant.findOne({ _id: variantId, product: product._id });
  if (!variant) throw ApiError.notFound('That option is no longer available');
  if (!variant.isActive) throw ApiError.badRequest(`"${variant.label}" is currently unavailable`);
  if (requireStock && variant.stock < requireStock) {
    throw ApiError.badRequest(
      variant.stock <= 0
        ? `"${variant.label}" is out of stock`
        : `Only ${variant.stock} unit(s) of "${variant.label}" left in stock`
    );
  }

  return variant;
}

/** "a size" / "a colour and a size" — used in the "please choose…" prompts. */
function optionPrompt(product) {
  const names = (product.variantAttributes || []).map((a) => a.name.toLowerCase());
  if (!names.length) return 'an option';
  if (names.length === 1) return `a ${names[0]}`;
  return `${names.slice(0, -1).map((n) => `a ${n}`).join(', ')} and a ${names[names.length - 1]}`;
}

/**
 * The compact shape the storefront selector needs. Prices, stock and imagery per SKU are
 * all included, so switching a variant is instant and needs no further request.
 */
const publicVariant = (variant) => ({
  _id: String(variant._id),
  sku: variant.sku,
  attributes: (variant.attributes || []).map((a) => ({
    name: a.name,
    slug: a.slug,
    value: a.value,
    valueSlug: a.valueSlug,
  })),
  price: variant.price,
  discountPercent: variant.discountPercent,
  finalPrice: variant.finalPrice,
  stock: variant.stock,
  lowStockThreshold: variant.lowStockThreshold,
  inStock: variant.isActive && variant.stock > 0,
  isActive: variant.isActive,
  isDefault: variant.isDefault,
  images: variant.images || [],
  weight: variant.weight?.value ? variant.weight : undefined,
  dimensions: variant.dimensions?.length || variant.dimensions?.width || variant.dimensions?.height
    ? variant.dimensions
    : undefined,
  label: (variant.attributes || []).map((a) => a.value).join(' · '),
});

/** Loads the variants a product page should render, cheapest-first within display order. */
async function listPublicVariants(productId) {
  const ProductVariant = mongoose.model('ProductVariant');
  const variants = await ProductVariant.find({ product: productId })
    .sort({ displayOrder: 1, createdAt: 1 })
    .lean({ virtuals: true });
  return variants.map(publicVariant);
}

module.exports = {
  MAX_COMBINATIONS,
  buildAttributeKey,
  variantLabel,
  normaliseAttributeDefinitions,
  generateCombinations,
  buildSkuCandidate,
  productSkuBase,
  uniqueSku,
  syncProductAggregates,
  reconcileVariants,
  resolveVariant,
  optionPrompt,
  publicVariant,
  listPublicVariants,
};
