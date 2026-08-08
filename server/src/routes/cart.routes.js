const express = require('express');
const ctrl = require('../controllers/cart.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { cartItemRules, cartQuantityRules, cartVariantRules, objectId } = require('../validators');

const router = express.Router();

router.use(protect); // the whole cart is per-account

router.get('/', ctrl.getCart);
router.delete('/', ctrl.clearCart);
router.post('/merge', ctrl.mergeGuestCart);

router.post('/items', cartItemRules, validate, ctrl.addItem);
router.patch('/items/:itemId', objectId('itemId'), cartQuantityRules, validate, ctrl.updateItem);
router.delete('/items/:itemId', objectId('itemId'), validate, ctrl.removeItem);
router.patch('/items/:itemId/save-for-later', objectId('itemId'), validate, ctrl.toggleSaveForLater);
// "Actually, make that a Large" — swaps the SKU without losing the line.
router.patch('/items/:itemId/variant', objectId('itemId'), cartVariantRules, validate, ctrl.changeItemVariant);

router.post('/coupon', ctrl.applyCoupon);
router.delete('/coupon', ctrl.removeCoupon);

module.exports = router;
