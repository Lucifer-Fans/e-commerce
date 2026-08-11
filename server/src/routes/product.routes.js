const express = require('express');
const ctrl = require('../controllers/product.controller');
const reviewCtrl = require('../controllers/review.controller');
const variantCtrl = require('../controllers/variant.controller');
const validate = require('../middleware/validate');
const { protect, optionalAuth, adminOnly } = require('../middleware/auth');
const { cache } = require('../middleware/cacheControl');
const {
  product: rules,
  variant: variantRules,
  objectId,
  pagination,
  reviewRules,
  translationsRules,
} = require('../validators');

const router = express.Router();

/* ---- Public (optionalAuth lets admins preview drafts with the same routes) ---- */
router.get('/', optionalAuth, pagination, validate, cache.catalogue, ctrl.listProducts);
router.get('/filters', cache.catalogue, ctrl.getFilterMeta);
router.get('/search', cache.search, ctrl.searchSuggestions);
router.get('/home-feed', cache.catalogue, ctrl.getHomeFeed);
router.post('/by-ids', ctrl.getProductsByIds);

/* ---- Admin writes (declared before /:idOrSlug so they aren't shadowed) ---- */
router.post('/', protect, adminOnly, rules.createProductRules, translationsRules, validate, ctrl.createProduct);
router.patch('/:id', protect, adminOnly, objectId('id'), rules.updateProductRules, translationsRules, validate, ctrl.updateProduct);
router.delete('/:id', protect, adminOnly, objectId('id'), validate, ctrl.deleteProduct);
router.patch('/:id/status', protect, adminOnly, objectId('id'), rules.statusRules, validate, ctrl.updateProductStatus);
router.patch('/:id/stock', protect, adminOnly, objectId('id'), rules.stockRules, validate, ctrl.updateStock);

/* ---- Variants nested under a product ---- *
 * The list is public: the storefront selector renders every combination, including the
 * unavailable ones, which stay visible and disabled rather than hidden.
 */
router.get('/:productId/variants', optionalAuth, objectId('productId'), validate, cache.catalogue, variantCtrl.listVariants);
router.post('/:productId/variants', protect, adminOnly, objectId('productId'), variantRules.createVariantRules, validate, variantCtrl.createVariant);
router.put('/:productId/variants', protect, adminOnly, objectId('productId'), variantRules.replaceRules, validate, variantCtrl.replaceVariants);
router.post('/:productId/variants/generate', protect, adminOnly, objectId('productId'), variantRules.generateRules, validate, variantCtrl.generateVariants);
router.patch('/:productId/variant-attributes', protect, adminOnly, objectId('productId'), variantRules.attributeRules, validate, variantCtrl.updateVariantAttributes);

/* ---- Reviews nested under a product ---- */
router.get('/:productId/reviews', optionalAuth, objectId('productId'), pagination, validate, cache.search, reviewCtrl.listReviews);
router.post('/:productId/reviews', protect, objectId('productId'), reviewRules, validate, reviewCtrl.createReview);

router.get('/:id/related', objectId('id'), validate, cache.catalogue, ctrl.getRelatedProducts);
router.get('/:idOrSlug', optionalAuth, cache.catalogue, ctrl.getProduct);

module.exports = router;
