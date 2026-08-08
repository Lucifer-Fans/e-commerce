const express = require('express');
const ctrl = require('../controllers/upload.controller');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadSingle, uploadMultiple } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.use(protect, uploadLimiter);

// Any signed-in user may upload an avatar / review photo.
router.post('/image', uploadSingle, ctrl.uploadImage);

// Bulk product imagery is admin-only.
router.post('/images', adminOnly, uploadMultiple, ctrl.uploadImages);
router.delete('/*', adminOnly, ctrl.deleteImage);

module.exports = router;
