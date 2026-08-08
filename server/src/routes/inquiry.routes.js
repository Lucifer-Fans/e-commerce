const express = require('express');
const ctrl = require('../controllers/inquiry.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { publicFormLimiter } = require('../middleware/rateLimiter');
const { inquiryRules, inquiryReplyRules, objectId, pagination } = require('../validators');

const router = express.Router();

// Public: the storefront's "Get in touch" form.
router.post('/', publicFormLimiter, inquiryRules, validate, ctrl.createInquiry);

router.use(protect, adminOnly);
router.get('/stats', ctrl.inquiryStats);
router.get('/', pagination, validate, ctrl.listInquiries);
router.get('/:id', objectId('id'), validate, ctrl.getInquiry);
router.patch('/:id/read', objectId('id'), validate, ctrl.setInquiryRead);
router.post('/:id/reply', objectId('id'), inquiryReplyRules, validate, ctrl.replyToInquiry);
router.delete('/:id', objectId('id'), validate, ctrl.deleteInquiry);

module.exports = router;
