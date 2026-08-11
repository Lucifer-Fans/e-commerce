const express = require('express');
const ctrl = require('../controllers/setting.controller');
const validate = require('../middleware/validate');
const { protect, optionalAuth, adminOnly } = require('../middleware/auth');
const { cache } = require('../middleware/cacheControl');
const { settingRules, translationsRules } = require('../validators');

const router = express.Router();

// Public: the storefront renders its title, meta tags, logo and footer from this.
// optionalAuth so the admin panel still receives the raw `translations` to edit.
router.get('/', optionalAuth, cache.settings, ctrl.getSettings);

router.patch('/', protect, adminOnly, settingRules, translationsRules, validate, ctrl.updateSettings);

module.exports = router;
