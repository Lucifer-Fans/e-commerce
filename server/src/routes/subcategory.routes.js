const express = require('express');
const ctrl = require('../controllers/category.controller');
const validate = require('../middleware/validate');
const { protect, optionalAuth, adminOnly } = require('../middleware/auth');
const { cache } = require('../middleware/cacheControl');
const { subCategoryRules, translationsRules, objectId } = require('../validators');

const router = express.Router();

router.get('/', optionalAuth, cache.taxonomy, ctrl.listSubCategories);
router.post('/', protect, adminOnly, subCategoryRules, translationsRules, validate, ctrl.createSubCategory);
router.patch('/:id', protect, adminOnly, objectId('id'), translationsRules, validate, ctrl.updateSubCategory);
router.delete('/:id', protect, adminOnly, objectId('id'), validate, ctrl.deleteSubCategory);

module.exports = router;
