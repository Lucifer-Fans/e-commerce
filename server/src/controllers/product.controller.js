const mongoose = require('mongoose');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, paginationMeta } = require('../utils/apiResponse');
const { Product, ProductVariant, Category, SubCategory, Brand, Review } = require('../models');
const { destroyAsset } = require('../config/cloudinary');
const variantService = require('../services/variant.service');
const broadcast = require('../realtime/broadcast');
const { localizeAll, localizeProduct, localizeProducts } = require('../utils/localize');

// `hasVariants` and `variantSummary` ride along on every list payload so cards can show
// "From ₹1,299" and a colour count without a second request. `translations` is selected
// so localize() can overlay it, then stripped from the response before it is sent.
const LIST_FIELDS =
  'name slug brand price discountPercent finalPrice stock lowStockThreshold images ratings status isFeatured isTopSelling soldCount category subCategory hasVariants variantSummary variantAttributes translations createdAt';

/** Taxonomy is populated everywhere a product is; it needs its own copy translated. */
const TAXONOMY_FIELDS = 'name slug translations';

const SORT_MAP = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { finalPrice: 1 },
  price_desc: { finalPrice: -1 },
  rating: { 'ratings.average': -1, 'ratings.count': -1 },
  popular: { soldCount: -1, viewCount: -1 },
  discount: { discountPercent: -1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
};

/** Translate query params into a Mongo filter. Shared by the storefront and admin lists. */
async function buildFilter(query, { isAdmin = false } = {}) {
  const filter = {};

  // Shoppers only ever see published products; admins can ask for any status.
  if (isAdmin) {
    if (query.status && query.status !== 'all') filter.status = query.status;
  } else {
    filter.status = 'published';
  }

  // Category / sub-category accept either an ObjectId or a slug.
  if (query.category) {
    const ids = await resolveRefs(Category, query.category);
    if (ids.length) filter.category = { $in: ids };
    else return { __empty: true };
  }
  if (query.subCategory) {
    const ids = await resolveRefs(SubCategory, query.subCategory);
    if (ids.length) filter.subCategory = { $in: ids };
    else return { __empty: true };
  }

  if (query.brand) filter.brand = { $in: String(query.brand).split(',').map((b) => b.trim()) };
  if (query.tags) filter.tags = { $in: String(query.tags).split(',').map((t) => t.trim()) };

  const min = Number(query.minPrice);
  const max = Number(query.maxPrice);
  if (!Number.isNaN(min) || !Number.isNaN(max)) {
    filter.finalPrice = {};
    if (!Number.isNaN(min)) filter.finalPrice.$gte = min;
    if (!Number.isNaN(max)) filter.finalPrice.$lte = max;
  }

  if (query.minDiscount) filter.discountPercent = { $gte: Number(query.minDiscount) };
  if (query.minRating) filter['ratings.average'] = { $gte: Number(query.minRating) };

  if (query.availability === 'in_stock') filter.stock = { $gt: 0 };
  if (query.availability === 'out_of_stock') filter.stock = { $lte: 0 };

  if (query.featured === 'true') filter.isFeatured = true;
  if (query.topSelling === 'true') filter.isTopSelling = true;

  if (query.search) {
    const safe = String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(safe, 'i');
    // Regex (not $text) so partial words like "ply" still match "plywood".
    filter.$or = [{ name: rx }, { brand: rx }, { shortDescription: rx }, { tags: rx }, { sku: rx }];
  }

  return filter;
}

async function resolveRefs(Model, raw) {
  const values = String(raw).split(',').map((v) => v.trim()).filter(Boolean);
  const ids = values.filter((v) => mongoose.isValidObjectId(v));
  const slugs = values.filter((v) => !mongoose.isValidObjectId(v));
  if (slugs.length) {
    const found = await Model.find({ slug: { $in: slugs } }).select('_id').lean();
    ids.push(...found.map((d) => String(d._id)));
  }
  return ids;
}

const parsePaging = (query, defaultLimit = 12) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(60, Math.max(1, Number(query.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

/* ------------------------------------------------------------------ */

/** GET /products — storefront listing with filters, sorting, pagination. */
exports.listProducts = asyncHandler(async (req, res) => {
  const isAdmin = req.user?.role === 'admin' && req.query.adminView === 'true';
  const filter = await buildFilter(req.query, { isAdmin });
  const { page, limit, skip } = parsePaging(req.query, isAdmin ? 10 : 12);

  if (filter.__empty) {
    return sendSuccess(res, {
      message: 'Products fetched',
      data: { products: [] },
      meta: paginationMeta({ total: 0, page, limit }),
    });
  }

  const sort = SORT_MAP[req.query.sort] || SORT_MAP.newest;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select(isAdmin ? undefined : LIST_FIELDS)
      .populate('category', TAXONOMY_FIELDS)
      .populate('subCategory', TAXONOMY_FIELDS)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean({ virtuals: true }),
    Product.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    message: 'Products fetched',
    // The admin list edits the source copy, so it must see it untranslated.
    data: { products: isAdmin ? products : localizeProducts(products, req.language) },
    meta: paginationMeta({ total, page, limit }),
  });
});

/**
 * GET /products/filters — the value ranges the sidebar needs (price bounds, brands,
 * counts per sub-category), computed for the *current* filter set.
 */
exports.getFilterMeta = asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query);
  if (filter.__empty) {
    return sendSuccess(res, {
      message: 'Filter metadata fetched',
      data: { priceRange: { min: 0, max: 0 }, brands: [], subCategories: [], total: 0 },
    });
  }

  const [agg] = await Product.aggregate([
    { $match: filter },
    {
      $facet: {
        price: [{ $group: { _id: null, min: { $min: '$finalPrice' }, max: { $max: '$finalPrice' } } }],
        brands: [
          { $match: { brand: { $ne: null } } },
          { $group: { _id: '$brand', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
          { $limit: 25 },
        ],
        subCategories: [
          { $group: { _id: '$subCategory', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ],
        total: [{ $count: 'value' }],
      },
    },
  ]);

  const subCatIds = agg.subCategories.map((s) => s._id).filter(Boolean);
  const subCatDocs = await SubCategory.find({ _id: { $in: subCatIds } })
    .select('name slug category translations')
    .lean();
  const byId = new Map(
    localizeAll(subCatDocs, req.language).map((d) => [String(d._id), d])
  );

  // Products store the brand as a name; the catalogue supplies the artwork for it.
  const brandNames = agg.brands.map((b) => b._id).filter(Boolean);
  const brandDocs = brandNames.length
    ? await Brand.find({ name: { $in: brandNames } }).select('name slug logo').lean()
    : [];
  const brandByName = new Map(brandDocs.map((b) => [b.name, b]));

  return sendSuccess(res, {
    message: 'Filter metadata fetched',
    data: {
      priceRange: {
        min: Math.floor(agg.price[0]?.min ?? 0),
        max: Math.ceil(agg.price[0]?.max ?? 0),
      },
      brands: agg.brands.map((b) => ({
        name: b._id,
        count: b.count,
        slug: brandByName.get(b._id)?.slug,
        logo: brandByName.get(b._id)?.logo,
      })),
      subCategories: agg.subCategories
        .filter((s) => byId.has(String(s._id)))
        .map((s) => ({ ...byId.get(String(s._id)), count: s.count })),
      total: agg.total[0]?.value ?? 0,
    },
  });
});

/** GET /products/search?q= — lightweight live-search feed for the header. */
exports.searchSuggestions = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) {
    return sendSuccess(res, { message: 'Suggestions fetched', data: { products: [], categories: [] } });
  }

  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = new RegExp(safe, 'i');

  /*
   * Matching stays on the English source: `name` and `translations.<lang>.name` are
   * both searched, so a Hindi shopper finds a product by typing either its English
   * model number or its translated name. The results are then shown translated.
   */
  const [products, categories] = await Promise.all([
    Product.find({
      status: 'published',
      $or: [{ name: rx }, { brand: rx }, { tags: rx }, { [`translations.${req.language}.name`]: rx }],
    })
      .select('name slug finalPrice price discountPercent images ratings translations')
      .limit(8)
      .lean({ virtuals: true }),
    Category.find({
      isActive: true,
      $or: [{ name: rx }, { [`translations.${req.language}.name`]: rx }],
    })
      .select('name slug translations')
      .limit(4)
      .lean(),
  ]);

  return sendSuccess(res, {
    message: 'Suggestions fetched',
    data: {
      products: localizeProducts(products, req.language),
      categories: localizeAll(categories, req.language),
    },
  });
});

/** GET /products/:idOrSlug */
exports.getProduct = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const query = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  if (req.user?.role !== 'admin') query.status = 'published';

  const product = await Product.findOne(query)
    .populate('category', TAXONOMY_FIELDS)
    .populate('subCategory', TAXONOMY_FIELDS);

  if (!product) throw ApiError.notFound('Product not found');

  // Fire-and-forget: a view counter must never delay or fail the response.
  Product.updateOne({ _id: product._id }, { $inc: { viewCount: 1 } }).catch(() => {});

  // Every combination — including sold-out and inactive ones, which the selector shows
  // disabled rather than hiding — travels with the product so switching a variant needs
  // no further round trip.
  // The admin form edits the source copy, so it must receive it untranslated.
  const isAdmin = req.user?.role === 'admin';
  const payload = isAdmin
    ? product.toJSON()
    : localizeProduct(product.toJSON(), req.language);

  if (product.hasVariants) {
    payload.variants = await variantService.listPublicVariants(product._id);
  }

  return sendSuccess(res, { message: 'Product fetched', data: { product: payload } });
});

/** GET /products/:id/related */
exports.getRelatedProducts = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).select('category subCategory tags');
  if (!product) throw ApiError.notFound('Product not found');

  const related = await Product.find({
    _id: { $ne: product._id },
    status: 'published',
    $or: [
      { subCategory: product.subCategory },
      { category: product.category },
      ...(product.tags?.length ? [{ tags: { $in: product.tags } }] : []),
    ],
  })
    .select(LIST_FIELDS)
    .sort({ soldCount: -1, 'ratings.average': -1 })
    .limit(Number(req.query.limit) || 8)
    .lean({ virtuals: true });

  return sendSuccess(res, {
    message: 'Related products fetched',
    data: { products: localizeProducts(related, req.language) },
  });
});

/**
 * POST /products/by-ids — resolves the "recently viewed" list the client keeps in
 * localStorage. Order of the request is preserved in the response.
 */
exports.getProductsByIds = asyncHandler(async (req, res) => {
  const ids = (req.body.ids || []).filter((id) => mongoose.isValidObjectId(id)).slice(0, 20);
  if (!ids.length) return sendSuccess(res, { message: 'Products fetched', data: { products: [] } });

  const products = await Product.find({ _id: { $in: ids }, status: 'published' })
    .select(LIST_FIELDS)
    .lean({ virtuals: true });

  const byId = new Map(products.map((p) => [String(p._id), p]));
  const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);

  return sendSuccess(res, {
    message: 'Products fetched',
    data: { products: localizeProducts(ordered, req.language) },
  });
});

/** GET /products/home-feed — every homepage rail in one round trip. */
exports.getHomeFeed = asyncHandler(async (req, res) => {
  const base = { status: 'published' };
  const select = LIST_FIELDS;

  const [forYou, topSelling, newArrivals, bestDeals, topRated] = await Promise.all([
    Product.find({ ...base, isFeatured: true }).select(select).sort({ createdAt: -1 }).limit(10).lean({ virtuals: true }),
    Product.find({ ...base, isTopSelling: true }).select(select).sort({ soldCount: -1 }).limit(10).lean({ virtuals: true }),
    Product.find(base).select(select).sort({ createdAt: -1 }).limit(10).lean({ virtuals: true }),
    Product.find({ ...base, discountPercent: { $gte: 10 } }).select(select).sort({ discountPercent: -1 }).limit(10).lean({ virtuals: true }),
    Product.find({ ...base, 'ratings.count': { $gt: 0 } }).select(select).sort({ 'ratings.average': -1 }).limit(10).lean({ virtuals: true }),
  ]);

  const lang = req.language;

  /*
   * The rail headings are interface copy, not catalogue data, so the API sends the
   * stable `key` and the storefront renders `shop:home.sections.<key>`. The English
   * title/subtitle still ride along as a fallback for any client that has not been
   * updated — but the storefront never displays them.
   *
   * If the admin hasn't flagged anything yet, each rail falls back to another so
   * none renders empty.
   */
  return sendSuccess(res, {
    message: 'Home feed fetched',
    data: {
      sections: [
        { key: 'for_you', title: 'Products For You', subtitle: 'Handpicked for your taste', products: forYou.length ? forYou : newArrivals },
        { key: 'top_selling', title: 'Top Selling Products', subtitle: 'What everyone is buying', products: topSelling.length ? topSelling : bestDeals },
        { key: 'new_arrivals', title: 'New Arrivals', subtitle: 'Fresh in store', products: newArrivals },
        { key: 'best_deals', title: 'Best Deals', subtitle: 'Biggest discounts right now', products: bestDeals },
        { key: 'top_rated', title: 'Top Rated', subtitle: 'Loved by our customers', products: topRated },
      ]
        .filter((s) => s.products.length > 0)
        .map((s) => ({ ...s, products: localizeProducts(s.products, lang) })),
    },
  });
});

/* ------------------------------------------------------------------ *
 * Admin writes
 * ------------------------------------------------------------------ */

/** POST /products (admin) */
exports.createProduct = asyncHandler(async (req, res) => {
  const payload = { ...req.body, createdBy: req.user._id };
  delete payload.finalPrice; // always derived
  delete payload.ratings;
  delete payload.soldCount;
  // Variants are rows in their own collection, reconciled after the product exists.
  const variantRows = Array.isArray(payload.variants) ? payload.variants : null;
  delete payload.variants;
  delete payload.variantSummary;
  delete payload.hasVariants;
  if (payload.variantAttributes) {
    payload.variantAttributes = variantService.normaliseAttributeDefinitions(payload.variantAttributes);
  }

  if (!(await Category.exists({ _id: payload.category }))) {
    throw ApiError.badRequest('Selected category does not exist');
  }
  if (payload.subCategory) {
    const sub = await SubCategory.findById(payload.subCategory).select('category');
    if (!sub) throw ApiError.badRequest('Selected sub-category does not exist');
    if (String(sub.category) !== String(payload.category)) {
      throw ApiError.badRequest('Sub-category does not belong to the selected category');
    }
  }

  const product = await Product.create(payload);

  let variants = [];
  if (variantRows?.length) variants = await variantService.reconcileVariants(product, variantRows);

  // reconcileVariants rewrote the rollup (stock, price, hasVariants) — re-read it.
  const saved = await Product.findById(product._id)
    .populate('category', TAXONOMY_FIELDS)
    .populate('subCategory', TAXONOMY_FIELDS);

  broadcast.productCreated(saved);
  if (variants.length) broadcast.variantsChanged('created', saved);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Product created',
    data: {
      product: {
        ...saved.toJSON(),
        variants: variants.map(variantService.publicVariant),
      },
    },
  });
});

/** PATCH /products/:id (admin) */
exports.updateProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const payload = { ...req.body };
  delete payload.finalPrice;
  delete payload.ratings;
  delete payload.soldCount;
  delete payload.createdBy;
  // Both are derived from the variant rows; a client-sent value is never trusted.
  delete payload.variantSummary;
  delete payload.hasVariants;

  // `undefined` means "the caller isn't touching variants" (e.g. a quick status edit);
  // an empty array means "this product no longer has any".
  const variantRows = Array.isArray(payload.variants) ? payload.variants : undefined;
  delete payload.variants;
  if (payload.variantAttributes) {
    payload.variantAttributes = variantService.normaliseAttributeDefinitions(payload.variantAttributes);
  }

  if (payload.subCategory) {
    const sub = await SubCategory.findById(payload.subCategory).select('category');
    const targetCategory = payload.category || product.category;
    if (!sub) throw ApiError.badRequest('Selected sub-category does not exist');
    if (String(sub.category) !== String(targetCategory)) {
      throw ApiError.badRequest('Sub-category does not belong to the selected category');
    }
  }

  // Any image dropped from the new set is removed from Cloudinary too — unless a variant
  // is still using it, which is legal since variants may reuse the parent's photography.
  if (Array.isArray(payload.images)) {
    const keep = new Set(payload.images.map((i) => i.publicId));
    const orphans = product.images.filter((i) => !keep.has(i.publicId));
    if (orphans.length) {
      const usedByVariants = new Set(
        (await ProductVariant.find({ product: product._id }).select('images.publicId').lean()).flatMap((v) =>
          (v.images || []).map((i) => i.publicId)
        )
      );
      await Promise.all(
        orphans.filter((i) => !usedByVariants.has(i.publicId)).map((i) => destroyAsset(i.publicId))
      );
    }
  }

  Object.assign(product, payload);
  await product.save();

  let variants = null;
  if (variantRows !== undefined) {
    variants = await variantService.reconcileVariants(product, variantRows);
  } else if (product.hasVariants && (payload.price !== undefined || payload.discountPercent !== undefined)) {
    // Repricing the parent must not silently override the SKUs; the rollup wins back.
    await variantService.syncProductAggregates(product._id);
  }

  const saved = await Product.findById(product._id)
    .populate('category', TAXONOMY_FIELDS)
    .populate('subCategory', TAXONOMY_FIELDS);

  broadcast.productUpdated(saved);
  if (variants) {
    broadcast.variantsChanged('replaced', saved);
    broadcast.stockChanged([{ product: saved._id }], { reason: 'variants_updated' });
  }

  return sendSuccess(res, {
    message: 'Product updated',
    data: {
      product: {
        ...saved.toJSON(),
        ...(variants ? { variants: variants.map(variantService.publicVariant) } : {}),
      },
    },
  });
});

/** DELETE /products/:id (admin) */
exports.deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  // Variant imagery is owned by the variant, so it is released here too.
  const variants = await ProductVariant.find({ product: product._id }).select('images').lean();
  const assets = new Set([
    ...product.images.map((img) => img.publicId),
    ...variants.flatMap((v) => (v.images || []).map((img) => img.publicId)),
  ]);

  await Promise.all([...assets].filter(Boolean).map((publicId) => destroyAsset(publicId)));
  await ProductVariant.deleteMany({ product: product._id });
  await Review.deleteMany({ product: product._id });
  await product.deleteOne();

  broadcast.productDeleted(product);

  return sendSuccess(res, { message: 'Product deleted' });
});

/** PATCH /products/:id/status (admin) — publish / unpublish toggle. */
exports.updateProductStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!product) throw ApiError.notFound('Product not found');

  broadcast.productUpdated(product);

  return sendSuccess(res, { message: `Product ${status}`, data: { product } });
});

/** PATCH /products/:id/stock (admin) */
exports.updateStock = asyncHandler(async (req, res) => {
  const existing = await Product.findById(req.params.id).select('hasVariants');
  if (!existing) throw ApiError.notFound('Product not found');
  if (existing.hasVariants) {
    // The parent's stock is a rollup of its SKUs — writing it directly would be undone by
    // the next sync and would hide which combination actually needs restocking.
    throw ApiError.badRequest('This product is stocked per variant — update the individual SKUs instead');
  }

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { stock: req.body.stock },
    { new: true, runValidators: true }
  );
  if (!product) throw ApiError.notFound('Product not found');

  broadcast.stockChanged([{ product: product._id }], { reason: 'admin_adjustment' });

  return sendSuccess(res, { message: 'Stock updated', data: { product } });
});

exports.LIST_FIELDS = LIST_FIELDS;
