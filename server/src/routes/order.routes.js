const express = require('express');
const ctrl = require('../controllers/order.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const {
  checkoutRules,
  orderStatusRules,
  refundRules,
  cancelOrderRules,
  objectId,
  pagination,
} = require('../validators');

const router = express.Router();

router.use(protect);

/* ---- Admin (static paths first so "admin" isn't parsed as an id) ---- */
router.get('/admin/all', adminOnly, pagination, validate, ctrl.listAllOrders);
router.get('/admin/statuses', adminOnly, ctrl.getStatusOptions);

/* ---- Customer ---- */
router.post('/checkout-summary', checkoutRules, validate, ctrl.getCheckoutSummary);
router.post('/', checkoutRules, validate, ctrl.createOrder);
router.get('/', pagination, validate, ctrl.getMyOrders);

router.get('/:id', objectId('id'), validate, ctrl.getOrder);
router.get('/:id/invoice', objectId('id'), validate, ctrl.downloadInvoice);
router.patch('/:id/cancel', objectId('id'), cancelOrderRules, validate, ctrl.cancelOrder);
router.patch('/:id/status', adminOnly, objectId('id'), orderStatusRules, validate, ctrl.updateOrderStatus);
// The one payment decision staff make; everything else moves on its own.
router.patch('/:id/mark-refunded', adminOnly, objectId('id'), refundRules, validate, ctrl.markRefunded);

module.exports = router;
