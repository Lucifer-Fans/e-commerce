const express = require('express');
const ctrl = require('../controllers/newsletter.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { publicFormLimiter } = require('../middleware/rateLimiter');
const { newsletterRules, newsletterStatusRules, objectId, pagination } = require('../validators');

const router = express.Router();

// Public: the storefront footer's subscribe box.
router.post('/', publicFormLimiter, newsletterRules, validate, ctrl.subscribe);

router.use(protect, adminOnly);
router.get('/', pagination, validate, ctrl.listSubscribers);
router.patch('/:id/status', objectId('id'), newsletterStatusRules, validate, ctrl.setSubscriberStatus);
router.delete('/:id', objectId('id'), validate, ctrl.deleteSubscriber);

module.exports = router;
