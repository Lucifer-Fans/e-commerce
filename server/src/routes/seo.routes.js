const express = require('express');
const seoController = require('../controllers/seo.controller');

/**
 * Crawler-facing files. Mounted at the site root in app.js, not under the API
 * prefix — /robots.txt and /sitemap.xml are the only paths a crawler will try.
 */
const router = express.Router();

router.get('/robots.txt', seoController.robots);
router.get('/sitemap.xml', seoController.sitemapIndex);
router.get('/sitemap-static.xml', seoController.sitemapStatic);
// Digits only, so a stray /sitemap-products-abc.xml falls through to the 404
// handler instead of being answered with an empty urlset.
router.get('/sitemap-products-:page(\\d+).xml', seoController.sitemapProducts);

module.exports = router;
