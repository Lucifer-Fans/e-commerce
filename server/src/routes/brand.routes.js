const express = require('express');
const ctrl = require('../controllers/brand.controller');
const validate = require('../middleware/validate');
const { protect, optionalAuth, adminOnly } = require('../middleware/auth');
const { cache } = require('../middleware/cacheControl');
const { brandRules, translationsRules, objectId } = require('../validators');

const router = express.Router();

router.get('/', optionalAuth, cache.taxonomy, ctrl.listBrands);
// optionalAuth so an admin previewing a brand still gets the raw `translations` to edit.
router.get('/:idOrSlug', optionalAuth, cache.taxonomy, ctrl.getBrand);

router.use(protect, adminOnly);
router.post('/', brandRules, translationsRules, validate, ctrl.createBrand);
router.patch('/:id', objectId('id'), translationsRules, validate, ctrl.updateBrand);
router.delete('/:id', objectId('id'), validate, ctrl.deleteBrand);

module.exports = router;
