const express = require('express');
const ctrl = require('../controllers/variant.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { variant: rules, objectId } = require('../validators');

const router = express.Router();

/**
 * Operations on a single SKU. The per-product routes (list, generate, replace) live on
 * the product router so they read as `/products/:id/variants`.
 */

/* ---- Admin (declared before /:id so they aren't shadowed) ---- */
router.get('/admin/low-stock', protect, adminOnly, ctrl.getLowStockVariants);

router.patch('/:id', protect, adminOnly, objectId('id'), rules.updateVariantRules, validate, ctrl.updateVariant);
router.patch('/:id/stock', protect, adminOnly, objectId('id'), rules.variantStockRules, validate, ctrl.updateVariantStock);
router.delete('/:id', protect, adminOnly, objectId('id'), validate, ctrl.deleteVariant);

module.exports = router;
