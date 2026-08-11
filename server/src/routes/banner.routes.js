const express = require('express');
const ctrl = require('../controllers/banner.controller');
const validate = require('../middleware/validate');
const { protect, optionalAuth, adminOnly } = require('../middleware/auth');
const { cache } = require('../middleware/cacheControl');
const { bannerRules, objectId } = require('../validators');

const router = express.Router();

router.get('/', optionalAuth, cache.banners, ctrl.listBanners);

router.use(protect, adminOnly);
router.post('/', bannerRules, validate, ctrl.createBanner);
router.patch('/reorder', ctrl.reorderBanners);
router.patch('/:id', objectId('id'), validate, ctrl.updateBanner);
router.delete('/:id', objectId('id'), validate, ctrl.deleteBanner);

module.exports = router;
