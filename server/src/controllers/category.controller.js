const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const { Category, SubCategory, Product } = require('../models');
const { destroyAsset } = require('../config/cloudinary');
const broadcast = require('../realtime/broadcast');
const { localize, localizeAll } = require('../utils/localize');

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

/** GET /categories — public nav feed (categories + nested sub-categories). */
exports.listCategories = asyncHandler(async (req, res) => {
  const includeInactive = req.query.includeInactive === 'true' && req.user?.role === 'admin';
  const filter = includeInactive ? {} : { isActive: true };

  const categories = await Category.find(filter)
    .sort({ displayOrder: 1, name: 1 })
    .populate({
      path: 'subCategories',
      match: includeInactive ? {} : { isActive: true },
      options: { sort: { displayOrder: 1, name: 1 } },
      select: 'name slug image displayOrder isActive category translations',
    })
    .lean({ virtuals: true });

  // The admin's category manager edits the source copy, so it must stay untranslated.
  const localized = includeInactive
    ? categories
    : localizeAll(categories, req.language).map((c) => ({
        ...c,
        subCategories: localizeAll(c.subCategories, req.language),
      }));

  return sendSuccess(res, { message: 'Categories fetched', data: { categories: localized } });
});

/** GET /categories/:idOrSlug */
exports.getCategory = asyncHandler(async (req, res) => {
  const { idOrSlug } = req.params;
  const query = idOrSlug.match(/^[0-9a-fA-F]{24}$/) ? { _id: idOrSlug } : { slug: idOrSlug };

  const category = await Category.findOne(query).populate({
    path: 'subCategories',
    match: { isActive: true },
    options: { sort: { displayOrder: 1 } },
  });
  if (!category) throw ApiError.notFound('Category not found');

  const payload = localize(category.toJSON(), req.language);
  payload.subCategories = localizeAll(payload.subCategories, req.language);

  return sendSuccess(res, { message: 'Category fetched', data: { category: payload } });
});

/** POST /categories (admin) */
exports.createCategory = asyncHandler(async (req, res) => {
  const category = await Category.create(req.body);
  broadcast.categoryChanged('created', category);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Category created',
    data: { category },
  });
});

/** PATCH /categories/:id (admin) */
exports.updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  // Replacing *or clearing* the artwork should not orphan the old Cloudinary asset.
  if (req.body.image && category.image?.publicId && category.image.publicId !== req.body.image.publicId) {
    await destroyAsset(category.image.publicId);
  }

  Object.assign(category, req.body);
  await category.save();

  broadcast.categoryChanged('updated', category);

  return sendSuccess(res, { message: 'Category updated', data: { category } });
});

/** DELETE /categories/:id (admin) */
exports.deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  const productCount = await Product.countDocuments({ category: category._id });
  if (productCount > 0) {
    throw ApiError.conflict(
      `Cannot delete: ${productCount} product(s) still use this category. Reassign or archive them first.`
    );
  }

  await SubCategory.deleteMany({ category: category._id });
  await destroyAsset(category.image?.publicId);
  await category.deleteOne();

  broadcast.categoryChanged('deleted', category);

  return sendSuccess(res, { message: 'Category deleted' });
});

/* ------------------------------------------------------------------ *
 * Sub-categories
 * ------------------------------------------------------------------ */

/** GET /categories/:categoryId/subcategories  |  GET /subcategories?category= */
exports.listSubCategories = asyncHandler(async (req, res) => {
  const categoryId = req.params.categoryId || req.query.category;
  const filter = { ...(categoryId ? { category: categoryId } : {}) };
  if (!(req.query.includeInactive === 'true' && req.user?.role === 'admin')) filter.isActive = true;

  const subCategories = await SubCategory.find(filter)
    .populate('category', 'name slug')
    .sort({ displayOrder: 1, name: 1 });

  return sendSuccess(res, { message: 'Sub-categories fetched', data: { subCategories } });
});

/** POST /subcategories (admin) */
exports.createSubCategory = asyncHandler(async (req, res) => {
  if (!(await Category.exists({ _id: req.body.category }))) {
    throw ApiError.badRequest('Parent category does not exist');
  }
  const subCategory = await SubCategory.create(req.body);
  broadcast.subCategoryChanged('created', subCategory);

  return sendSuccess(res, {
    statusCode: 201,
    message: 'Sub-category created',
    data: { subCategory },
  });
});

/** PATCH /subcategories/:id (admin) */
exports.updateSubCategory = asyncHandler(async (req, res) => {
  const subCategory = await SubCategory.findById(req.params.id);
  if (!subCategory) throw ApiError.notFound('Sub-category not found');

  if (req.body.category && !(await Category.exists({ _id: req.body.category }))) {
    throw ApiError.badRequest('Parent category does not exist');
  }

  // Replacing *or clearing* the artwork should not orphan the old Cloudinary asset.
  if (req.body.image && subCategory.image?.publicId && subCategory.image.publicId !== req.body.image.publicId) {
    await destroyAsset(subCategory.image.publicId);
  }

  Object.assign(subCategory, req.body);
  await subCategory.save();

  broadcast.subCategoryChanged('updated', subCategory);

  return sendSuccess(res, { message: 'Sub-category updated', data: { subCategory } });
});

/** DELETE /subcategories/:id (admin) */
exports.deleteSubCategory = asyncHandler(async (req, res) => {
  const subCategory = await SubCategory.findById(req.params.id);
  if (!subCategory) throw ApiError.notFound('Sub-category not found');

  const productCount = await Product.countDocuments({ subCategory: subCategory._id });
  if (productCount > 0) {
    throw ApiError.conflict(`Cannot delete: ${productCount} product(s) still use this sub-category.`);
  }

  await destroyAsset(subCategory.image?.publicId);
  await subCategory.deleteOne();

  broadcast.subCategoryChanged('deleted', subCategory);

  return sendSuccess(res, { message: 'Sub-category deleted' });
});
