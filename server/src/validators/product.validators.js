const { body } = require('express-validator');

const featureRules = [
  body('features').optional().isArray({ max: 50 }).withMessage('At most 50 features are allowed'),
  body('features.*.key').trim().notEmpty().withMessage('Feature name is required').isLength({ max: 60 }),
  body('features.*.value').trim().notEmpty().withMessage('Feature value is required').isLength({ max: 500 }),
];

const imageRules = [
  body('images').optional().isArray({ max: 5 }).withMessage('At most 5 images are allowed'),
  body('images.*.url').isURL().withMessage('Each image needs a valid URL'),
  body('images.*.publicId').notEmpty().withMessage('Each image needs a Cloudinary publicId'),
];

const videoRules = [
  body('videos').optional().isArray({ max: 2 }).withMessage('At most 2 videos are allowed'),
  body('videos.*.url').isURL().withMessage('Each video needs a valid URL'),
  body('videos.*.publicId').notEmpty().withMessage('Each video needs a Cloudinary publicId'),
  body('videos.*.duration').optional().isFloat({ min: 0 }).toFloat(),
];

/**
 * Products may carry their variant definition and their SKU rows in the same payload, so
 * the wizard saves everything in one round trip. Both are optional: a product with no
 * variation is still a first-class product.
 */
const variantRules = [
  body('variantAttributes').optional().isArray({ max: 6 }).withMessage('At most 6 variant attributes are allowed'),
  body('variantAttributes.*.name').optional().trim().isLength({ min: 1, max: 40 }).withMessage('Each variant attribute needs a name'),
  body('variantAttributes.*.values').optional().isArray({ max: 60 }).withMessage('An attribute can have at most 60 values'),
  body('variants').optional().isArray({ max: 500 }).withMessage('At most 500 variants per product'),
  body('variants.*.price').optional().isFloat({ min: 0 }).withMessage('Every variant needs a valid price').toFloat(),
  body('variants.*.discountPercent').optional().isFloat({ min: 0, max: 95 }).toFloat(),
  body('variants.*.stock').optional().isInt({ min: 0 }).withMessage('Variant stock must be 0 or more').toInt(),
];

exports.createProductRules = [
  body('name').trim().isLength({ min: 3, max: 160 }).withMessage('Product name must be 3-160 characters'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('shortDescription').optional().trim().isLength({ max: 300 }),
  body('brand').optional().trim().isLength({ max: 60 }),
  body('category').isMongoId().withMessage('Please select a valid category'),
  body('subCategory').optional({ values: 'falsy' }).isMongoId().withMessage('Please select a valid sub-category'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number').toFloat(),
  body('discountPercent').optional().isFloat({ min: 0, max: 95 }).withMessage('Discount must be between 0 and 95').toFloat(),
  body('stock').isInt({ min: 0 }).withMessage('Stock must be 0 or more').toInt(),
  body('lowStockThreshold').optional().isInt({ min: 0 }).toInt(),
  body('status').optional().isIn(['draft', 'published', 'archived']).withMessage('Invalid status'),
  body('highlights').optional().isArray({ max: 15 }),
  body('faqs').optional().isArray({ max: 20 }),
  body('faqs.*.question').optional().trim().notEmpty().withMessage('FAQ question cannot be empty'),
  body('faqs.*.answer').optional().trim().notEmpty().withMessage('FAQ answer cannot be empty'),
  ...featureRules,
  ...imageRules,
  ...videoRules,
  ...variantRules,
];

/** Update: same constraints, but every field is optional. */
exports.updateProductRules = [
  body('name').optional().trim().isLength({ min: 3, max: 160 }),
  body('description').optional().trim().notEmpty(),
  body('category').optional().isMongoId(),
  body('subCategory').optional({ values: 'falsy' }).isMongoId(),
  body('price').optional().isFloat({ min: 0 }).toFloat(),
  body('discountPercent').optional().isFloat({ min: 0, max: 95 }).toFloat(),
  body('stock').optional().isInt({ min: 0 }).toInt(),
  body('status').optional().isIn(['draft', 'published', 'archived']),
  ...featureRules,
  ...imageRules,
  ...videoRules,
  ...variantRules,
];

exports.statusRules = [
  body('status').isIn(['draft', 'published', 'archived']).withMessage('Invalid status'),
];

exports.stockRules = [body('stock').isInt({ min: 0 }).withMessage('Stock must be 0 or more').toInt()];
