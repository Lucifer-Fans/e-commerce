const express = require('express');
const ctrl = require('../controllers/user.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { uploadLimiter, otpLimiter } = require('../middleware/rateLimiter');
const {
  profileRules,
  languageRules,
  userStatusRules,
  userRoleRules,
  deactivationRequestRules,
  deactivationConfirmRules,
  reactivationDecisionRules,
  objectId,
  pagination,
} = require('../validators');

const router = express.Router();

router.use(protect);

router.patch('/me', profileRules, validate, ctrl.updateProfile);
router.patch('/me/language', languageRules, validate, ctrl.updateLanguage);
router.post('/me/avatar', uploadLimiter, uploadSingle, ctrl.updateAvatar);
router.delete('/me/avatar', ctrl.removeAvatar);

/*
 * Closing your own account, in two calls: the reason earns a code, the code does
 * the closing. Both carry `otpLimiter` rather than the auth one, because it counts
 * every call — a correct code should still spend from the ceiling, or the limit
 * only ever sees the guesses that missed.
 *
 * There is deliberately no single-call version any more. A DELETE that closed the
 * account outright would be a way around both the reason and the code, and it
 * would be reachable by anything holding a live access token.
 */
/*
 * Read-only, and unlimited on purpose: it is what the Danger Zone button calls
 * before it opens anything, so rate-limiting it would break the screen for
 * somebody who simply changed their mind twice.
 */
router.get('/me/deactivate/eligibility', ctrl.deactivationEligibility);
router.post(
  '/me/deactivate/request',
  otpLimiter,
  deactivationRequestRules,
  validate,
  ctrl.requestDeactivation
);
router.post(
  '/me/deactivate/confirm',
  otpLimiter,
  deactivationConfirmRules,
  validate,
  ctrl.confirmDeactivation
);

router.use(adminOnly);

/*
 * Ahead of '/:id': 'reactivation-requests' is a valid ObjectId-shaped nothing as
 * far as Express is concerned, and a route ordered the other way round would swallow
 * this whole section into the user-detail handler.
 */
router.get('/reactivation-requests', pagination, validate, ctrl.listReactivationRequests);
router.get(
  '/reactivation-requests/:id',
  objectId('id'),
  validate,
  ctrl.getReactivationRequest
);
router.patch(
  '/reactivation-requests/:id',
  objectId('id'),
  reactivationDecisionRules,
  validate,
  ctrl.decideReactivationRequest
);

router.get('/', pagination, validate, ctrl.listUsers);
router.get('/:id', objectId('id'), validate, ctrl.getUser);
router.patch('/:id/status', objectId('id'), userStatusRules, validate, ctrl.updateUserStatus);
router.patch('/:id/role', objectId('id'), userRoleRules, validate, ctrl.updateUserRole);

module.exports = router;
