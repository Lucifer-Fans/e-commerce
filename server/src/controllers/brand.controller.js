const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Brand, Product } = require('../models');
const { destroyAsset } = require('../config/cloudinary');
const broadcast = require('../realtime/broadcast');
const { localize, localizeAll } = require('../utils/localize');

/** Escapes a brand name so it can be matched case-insensitively but literally. */
const exactName = (name) => new RegExp(`^${String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/** GET /brands — the curated list; the storefront only ever sees the active ones. */
exports.listBrands = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true' && req.user?.role === 'admin';
  const filter = includeInactive ? {} : { isActive: true };
  if (req.query.featured === 'true') filter.isFeatured = true;

  const brands = await Brand.find(filter).sort({ displayOrder: 1, name: 1 }).lean();

  // Product counts are what make the list actionable in the admin ("can I delete this?").
  if (includeInactive && brands.length) {
    const counts = await Product.aggregate([
      { $match: { brand: { $in: brands.map((b) => b.name) } } },
      { $group: { _id: '$brand', count: { $sum: 1 } } },
    ]);
    const byName = new Map(counts.map((c) => [c._id, c.count]));
    brands.forEach((brand) => {
      brand.productCount = byName.get(brand.name) || 0;
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

/** POST /brands (admin) */
exports.createBrand = asyncHandler(async (req, res) => {
  if (await Brand.exists({ name: exactName(req.body.name) })) {
    throw ApiError.conflict('A brand with this name already exists');
  }

  const brand = await Brand.create(req.body);
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

  Object.assign(brand, req.body);
  await brand.save();

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

  broadcast.brandChanged('deleted', brand);

  return sendSuccess(res, { message: 'Brand deleted' });
});
