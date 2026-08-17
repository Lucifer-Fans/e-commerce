const express = require('express');
const ctrl = require('../controllers/deactivationReason.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { deactivationReasonRules, objectId } = require('../validators');

const router = express.Router();

// Signed in, but not admin-only: the storefront's deactivation dialog reads this list.
router.use(protect);
router.get('/', ctrl.listReasons);

router.use(adminOnly);
router.post('/', deactivationReasonRules, validate, ctrl.createReason);
router.patch('/:id', objectId('id'), deactivationReasonRules, validate, ctrl.updateReason);
router.delete('/:id', objectId('id'), validate, ctrl.deleteReason);

module.exports = router;
