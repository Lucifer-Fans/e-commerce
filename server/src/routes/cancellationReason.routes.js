const express = require('express');
const ctrl = require('../controllers/cancellationReason.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { cancellationReasonRules, objectId } = require('../validators');

const router = express.Router();

// Signed in, but not admin-only: the storefront's cancel dialog reads this list.
router.use(protect);
router.get('/', ctrl.listReasons);

router.use(adminOnly);
router.post('/', cancellationReasonRules, validate, ctrl.createReason);
router.patch('/:id', objectId('id'), cancellationReasonRules, validate, ctrl.updateReason);
router.delete('/:id', objectId('id'), validate, ctrl.deleteReason);

module.exports = router;
