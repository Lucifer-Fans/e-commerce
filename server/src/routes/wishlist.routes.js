const express = require('express');
const ctrl = require('../controllers/wishlist.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { objectId } = require('../validators');

const router = express.Router();

router.use(protect);

router.get('/', ctrl.getWishlist);
router.get('/ids', ctrl.getWishlistIds);
router.post('/', ctrl.addToWishlist);
router.delete('/', ctrl.clearWishlist);
router.post('/:productId/move-to-cart', objectId('productId'), validate, ctrl.moveToCart);
router.delete('/:productId', objectId('productId'), validate, ctrl.removeFromWishlist);

module.exports = router;
