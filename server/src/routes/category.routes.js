const express = require('express');
const ctrl = require('../controllers/category.controller');
const validate = require('../middleware/validate');
const { protect, optionalAuth, adminOnly } = require('../middleware/auth');
const { cache } = require('../middleware/cacheControl');
const { categoryRules, translationsRules, objectId } = require('../validators');

const router = express.Router();

// The cache middleware follows optionalAuth so it can see whether an admin is asking.
router.get('/', optionalAuth, cache.taxonomy, ctrl.listCategories);
router.post('/', protect, adminOnly, categoryRules, translationsRules, validate, ctrl.createCategory);

router.get('/:categoryId/subcategories', objectId('categoryId'), validate, cache.taxonomy, ctrl.listSubCategories);

router.get('/:idOrSlug', cache.taxonomy, ctrl.getCategory);
router.patch('/:id', protect, adminOnly, objectId('id'), translationsRules, validate, ctrl.updateCategory);
router.delete('/:id', protect, adminOnly, objectId('id'), validate, ctrl.deleteCategory);

module.exports = router;
