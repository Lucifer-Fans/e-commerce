const express = require('express');
const ctrl = require('../controllers/dashboard.controller');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.use(protect, adminOnly);

router.get('/stats', ctrl.getStats);
router.get('/sales-chart', ctrl.getSalesChart);
router.get('/order-status-breakdown', ctrl.getOrderStatusBreakdown);
router.get('/payment-preference', ctrl.getPaymentPreference);
router.get('/top-products', ctrl.getTopProducts);
router.get('/category-performance', ctrl.getCategoryPerformance);
router.get('/recent-orders', ctrl.getRecentOrders);
router.get('/low-stock', ctrl.getLowStockProducts);

module.exports = router;
