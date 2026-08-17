const express = require('express');
const ctrl = require('../controllers/coupon.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { couponRules, couponUpdateRules, objectId, pagination } = require('../validators');

const router = express.Router();

router.get('/available', ctrl.listAvailable);

router.use(protect, adminOnly);
router.get('/', pagination, validate, ctrl.listCoupons);
router.post('/', couponRules, validate, ctrl.createCoupon);
router.patch('/:id', objectId('id'), couponUpdateRules, validate, ctrl.updateCoupon);
router.delete('/:id', objectId('id'), validate, ctrl.deleteCoupon);

module.exports = router;
