const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Brand, Product } = require('../models');
const { destroyAsset } = require('../config/cloudinary');
const broadcast = require('../realtime/broadcast');
const { localize, localizeAll } = require('../utils/localize');
const {
  parseRequestedOrder,
  nextDisplayOrder,
  resequence,
  placeAndResequence,
} = require('../utils/displayOrder');

/**
 * How many products travel with each brand in the admin listing. The card scrolls
 * through them; anything past this is reachable from the products page, which is
 * where filtering and paging actually belong.
 */
const BRAND_PRODUCTS_LIMIT = 20;

/** Escapes a brand name so it can be matched case-insensitively but literally. */
const exactName = (name) => new RegExp(`^${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/** GET /brands — the curated list; the storefront only ever sees the active ones. */
exports.listBrands = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true' && req.user?.role === 'admin';
  const filter = includeInactive ? {} : { isActive: true };
  if (req.query.featured === 'true') filter.isFeatured = true;

  const brands = await Brand.find(filter).sort({ displayOrder: 1, name: 1 }).lean();

  /*
   * The admin card lists the products themselves, not just how many there are — the
   * count answered "can I delete this?" but never "what is actually under this brand?".
   *
   * One aggregation for every brand on the page, rather than a request per card: newest
   * first, then sliced, so a brand with hundreds of products still costs a fixed-size
   * payload. `productCount` remains the true total, which is what the heading shows.
   */
  if (includeInactive && brands.length) {
    const grouped = await Product.aggregate([
      { $match: { brand: { $in: brands.map((b) => b.name) } } },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$brand',
          count: { $sum: 1 },
          products: {
            $push: {
              _id: '$_id',
              name: '$name',
              slug: '$slug',
              status: '$status',
              // Only the first image is needed; the rest would be payload for nothing.
              image: { $arrayElemAt: ['$images.url', 0] },
            },
          },
        },
      },
      { $project: { count: 1, products: { $slice: ['$products', BRAND_PRODUCTS_LIMIT] } } },
    ]);

    const byName = new Map(grouped.map((row) => [row._id, row]));
    brands.forEach((brand) => {
      const row = byName.get(brand.name);
      brand.productCount = row?.count || 0;
      brand.products = row?.products || [];
    });
  }

  // The admin view edits the source document, so it keeps the raw `translations` map.
  const payload = includeInactive ? brands : localizeAll(brands, req.language);

  return sendSuccess(res, { message: 'Brands fetched', data: { brands: payload } });
});

/** GET /brands/:idOrSlug */
exports.getBrand = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const query = idOrSlug.match(/^[0-9a-fA-F]{24}$/) ? { _id: idOrSlug } : { slug: idOrSlug };

  const brand = await Brand.findOne(query).lean();
  if (!brand) throw ApiError.notFound('Brand not found');

  return sendSuccess(res, {
    message: 'Brand fetched',
    data: { brand: req.user?.role === 'admin' ? brand : localize(brand, req.language) },
  });
});

/**
 * POST /brands (admin)
 *
 * A display order another brand already holds is honoured rather than refused: the
 * newcomer keeps that position and the incumbent — with everything below it —
 * slides down one. No order at all means "last", which is what the panel proposes.
 */
exports.createBrand = asyncHandler(async (req, res) => {
  if (await Brand.exists({ name: exactName(req.body.name) })) {
    throw ApiError.conflict('A brand with this name already exists');
  }

  const requestedOrder = parseRequestedOrder(req.body.displayOrder);
  const brand = await Brand.create({
    ...req.body,
    displayOrder: requestedOrder ?? (await nextDisplayOrder(Brand)),
  });

  await placeAndResequence(Brand, {}, brand, requestedOrder);
  broadcast.brandChanged('created', brand);

  return sendSuccess(res, { statusCode: 201, message: 'Brand created', data: { brand } });
});

/** PATCH /brands/:id (admin) */
exports.updateBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw ApiError.notFound('Brand not found');

  const previousName = brand.name;
  const renaming = req.body.name && req.body.name !== previousName;

  if (renaming && (await Brand.exists({ _id: { $ne: brand._id }, name: exactName(req.body.name) }))) {
    throw ApiError.conflict('A brand with this name already exists');
  }

  // Replacing *or clearing* the logo should not orphan the old Cloudinary asset.
  if (req.body.logo && brand.logo?.publicId && brand.logo.publicId !== req.body.logo.publicId) {
    await destroyAsset(brand.logo.publicId);
  }

  const requestedOrder = parseRequestedOrder(req.body.displayOrder);
  Object.assign(brand, req.body);
  await brand.save();

  // Re-typing a sibling's number moves this brand onto it and pushes that one down;
  // a payload that never mentions the order leaves the running order untouched.
  await placeAndResequence(Brand, {}, brand, requestedOrder);

  // Products carry the brand by name, so a rename has to travel with it — otherwise
  // the storefront filter would keep offering a name nothing matches.
  if (renaming) await Product.updateMany({ brand: previousName }, { brand: brand.name });

  broadcast.brandChanged('updated', brand);

  return sendSuccess(res, { message: 'Brand updated', data: { brand } });
});

/** DELETE /brands/:id (admin) */
exports.deleteBrand = asyncHandler(async (req, res) => {
  const brand = await Brand.findById(req.params.id);
  if (!brand) throw ApiError.notFound('Brand not found');

  const productCount = await Product.countDocuments({ brand: brand.name });
  if (productCount > 0) {
    throw ApiError.conflict(
      `Cannot delete: ${productCount} product(s) still use this brand. Reassign or archive them first.`
    );
  }

  await destroyAsset(brand.logo?.publicId);
  await brand.deleteOne();

  // Close the gap the removed row left, so the column stays a 0, 1, 2 … run.
  await resequence(Brand);
  broadcast.brandChanged('deleted', brand);

  return sendSuccess(res, { message: 'Brand deleted' });
});
