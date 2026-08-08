const express = require('express');
const env = require('../config/env');

const router = express.Router();

router.get('/health', (_req, res) =>
  res.json({
    success: true,
    message: 'API is healthy',
    data: {
      uptime: Math.round(process.uptime()),
      environment: env.nodeEnv,
      integrations: {
        cloudinary: env.cloudinaryEnabled,
        razorpay: env.razorpayEnabled,
        mail: env.mailEnabled,
      },
    },
  })
);

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/categories', require('./category.routes'));
router.use('/subcategories', require('./subcategory.routes'));
router.use('/brands', require('./brand.routes'));
router.use('/products', require('./product.routes'));
router.use('/variants', require('./variant.routes'));
router.use('/reviews', require('./review.routes'));
router.use('/cart', require('./cart.routes'));
router.use('/wishlist', require('./wishlist.routes'));
router.use('/addresses', require('./address.routes'));
router.use('/orders', require('./order.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/coupons', require('./coupon.routes'));
router.use('/banners', require('./banner.routes'));
router.use('/uploads', require('./upload.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/settings', require('./setting.routes'));
router.use('/inquiries', require('./inquiry.routes'));
router.use('/careers', require('./career.routes'));
router.use('/newsletter', require('./newsletter.routes'));

module.exports = router;
