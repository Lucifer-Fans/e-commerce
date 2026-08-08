const express = require('express');
const ctrl = require('../controllers/review.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { reviewRules, objectId } = require('../validators');

const router = express.Router();

router.get('/mine', protect, ctrl.getMyReviews);
router.post('/:id/helpful', protect, objectId('id'), validate, ctrl.markHelpful);
router.patch('/:id', protect, objectId('id'), reviewRules, validate, ctrl.updateReview);
router.delete('/:id', protect, objectId('id'), validate, ctrl.deleteReview);

module.exports = router;
