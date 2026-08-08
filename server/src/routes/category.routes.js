const express = require('express');
const ctrl = require('../controllers/category.controller');
const validate = require('../middleware/validate');
const { protect, optionalAuth, adminOnly } = require('../middleware/auth');
const { categoryRules, translationsRules, objectId } = require('../validators');

const router = express.Router();

router.get('/', optionalAuth, ctrl.listCategories);
router.post('/', protect, adminOnly, categoryRules, translationsRules, validate, ctrl.createCategory);

router.get('/:categoryId/subcategories', objectId('categoryId'), validate, ctrl.listSubCategories);

router.get('/:idOrSlug', ctrl.getCategory);
router.patch('/:id', protect, adminOnly, objectId('id'), translationsRules, validate, ctrl.updateCategory);
router.delete('/:id', protect, adminOnly, objectId('id'), validate, ctrl.deleteCategory);

module.exports = router;
