const express = require('express');
const ctrl = require('../controllers/order.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { checkoutRules, orderStatusRules, objectId, pagination } = require('../validators');

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
router.patch('/:id/cancel', objectId('id'), validate, ctrl.cancelOrder);
router.patch('/:id/status', adminOnly, objectId('id'), orderStatusRules, validate, ctrl.updateOrderStatus);

module.exports = router;
