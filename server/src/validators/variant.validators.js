const { body } = require('express-validator');

/**
 * Variant payload rules. The attribute *names* are deliberately unconstrained — the whole
 * point of the system is that Color, Waist, Shoe Size or anything a future catalogue needs
 * works without a code change — so only shape, length and numeric bounds are enforced.
 */

const attributeDefinitionRules = [
  body('attributes').isArray({ min: 1, max: 6 }).withMessage('Define between 1 and 6 attributes'),
  body('attributes.*.name')
    .trim()
    .isLength({ min: 1, max: 40 })
    .withMessage('Each attribute needs a name of up to 40 characters'),
  body('attributes.*.inputType').optional().isIn(['auto', 'chip', 'swatch', 'image']),
  body('attributes.*.values')
    .isArray({ min: 1, max: 60 })
    .withMessage('Each attribute needs between 1 and 60 values'),
  body('attributes.*.values.*.label')
    .trim()
    .isLength({ min: 1, max: 60 })
    .withMessage('Each attribute value needs a label of up to 60 characters'),
  body('attributes.*.values.*.hex')
    .optional({ values: 'falsy' })
    .matches(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    .withMessage('Swatch colour must be a hex value like #1a1a1a'),
];

/** Shared by create/replace/update — every field optional so PATCH can send a subset. */
const variantRowRules = (prefix) => [
  body(`${prefix}sku`).optional({ values: 'falsy' }).trim().isLength({ max: 64 }).withMessage('SKU cannot exceed 64 characters'),
  body(`${prefix}price`).optional().isFloat({ min: 0 }).withMessage('Variant price must be a positive number').toFloat(),
  body(`${prefix}discountPercent`).optional().isFloat({ min: 0, max: 95 }).withMessage('Variant discount must be between 0 and 95').toFloat(),
  body(`${prefix}stock`).optional().isInt({ min: 0 }).withMessage('Variant stock must be 0 or more').toInt(),
  body(`${prefix}lowStockThreshold`).optional().isInt({ min: 0 }).toInt(),
  body(`${prefix}isActive`).optional().isBoolean().toBoolean(),
  body(`${prefix}images`).optional().isArray({ max: 5 }).withMessage('A variant can have at most 5 images'),
  body(`${prefix}weight.value`).optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body(`${prefix}weight.unit`).optional({ values: 'falsy' }).isIn(['g', 'kg']),
  body(`${prefix}dimensions.length`).optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body(`${prefix}dimensions.width`).optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body(`${prefix}dimensions.height`).optional({ values: 'falsy' }).isFloat({ min: 0 }).toFloat(),
  body(`${prefix}dimensions.unit`).optional({ values: 'falsy' }).isIn(['cm', 'in']),
  body(`${prefix}barcode`).optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body(`${prefix}hsnCode`).optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
];

exports.attributeRules = attributeDefinitionRules;

exports.generateRules = [
  body('attributes').optional().isArray({ min: 1, max: 6 }),
  body('attributes.*.name').optional().trim().isLength({ min: 1, max: 40 }),
  body('attributes.*.values').optional().isArray({ min: 1, max: 60 }),
  body('price').optional().isFloat({ min: 0 }).toFloat(),
  body('discountPercent').optional().isFloat({ min: 0, max: 95 }).toFloat(),
  body('stock').optional().isInt({ min: 0 }).toInt(),
];

exports.replaceRules = [
  body('variants').isArray({ max: 500 }).withMessage('At most 500 variants per product'),
  body('variants.*.attributes').isArray({ min: 1, max: 6 }).withMessage('Each variant needs its attribute values'),
  body('variants.*.attributes.*.name').trim().notEmpty().withMessage('Each variant attribute needs a name'),
  body('variants.*.attributes.*.value').trim().notEmpty().withMessage('Each variant attribute needs a value'),
  body('variants.*.price').isFloat({ min: 0 }).withMessage('Every variant needs a price').toFloat(),
  ...variantRowRules('variants.*.'),
];

exports.createVariantRules = [
  body('attributes').isArray({ min: 1, max: 6 }).withMessage('A variant needs its attribute values'),
  body('attributes.*.name').trim().notEmpty(),
  body('attributes.*.value').trim().notEmpty(),
  body('price').isFloat({ min: 0 }).withMessage('A variant needs a price').toFloat(),
  ...variantRowRules(''),
];

exports.updateVariantRules = variantRowRules('');

exports.variantStockRules = [
  body('stock').isInt({ min: 0 }).withMessage('Stock must be 0 or more').toInt(),
];
