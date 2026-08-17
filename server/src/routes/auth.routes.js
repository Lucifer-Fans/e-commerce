const express = require('express');
const ctrl = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { authLimiter, otpLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
// The reactivation rules sit alongside the other account-lifecycle ones on the
// top-level export rather than under the auth key, because user.routes reads the
// deactivation half of that same set.
const {
  auth: rules,
  reactivationEmailRules,
  reactivationTokenRules,
  reactivationSubmitRules,
} = require('../validators');

const router = express.Router();

router.post('/register', authLimiter, rules.registerRules, validate, ctrl.register);
// The two halves of a sign-up: the code is checked here, and asked for again here.
// `authLimiter` skips successful requests, which is wrong for these — a correct
// code should still count towards the ceiling, or the limit only ever sees the
// guesses that missed. `otpLimiter` counts every call.
router.post('/verify-email', otpLimiter, rules.verifyEmailRules, validate, ctrl.verifyEmail);
router.post('/resend-otp', otpLimiter, rules.resendOtpRules, validate, ctrl.resendEmailOtp);

router.post('/login', authLimiter, rules.loginRules, validate, ctrl.login);
router.post('/google', authLimiter, rules.googleLoginRules, validate, ctrl.googleLogin);
router.post('/admin/login', authLimiter, rules.loginRules, validate, ctrl.adminLogin);
router.post('/refresh', ctrl.refresh);
router.post('/logout', protect, ctrl.logout);
router.get('/me', protect, ctrl.me);

/* ---------------- Devices / active sessions ---------------- */
// Every one of these is scoped to the caller's own account inside the controller —
// being signed in is never enough to touch another user's session.
router.get('/sessions', protect, ctrl.listSessions);
router.delete('/sessions', protect, ctrl.revokeAllSessions);
router.delete('/sessions/:sessionId', protect, rules.sessionIdRules, validate, ctrl.revokeSession);

/* ---------------- Reactivation — the way back from a closed account ---------------- *
 * Every one of these is deliberately unauthenticated: the person using them
 * cannot sign in, which is the whole problem they exist to solve. What stands in
 * for a session is the single-use token from the emailed link, plus a one-time
 * code, plus the account's own details — checked in the controller, all three.
 *
 * The limiters are chosen to match what each step can be abused for. Asking for
 * a link sends mail to an address the caller names, so it takes the password
 * reset budget; the code steps count every call, correct or not, exactly as the
 * sign-up code screen does. */
router.post(
  '/reactivation/request',
  passwordResetLimiter,
  reactivationEmailRules,
  validate,
  ctrl.requestReactivation
);
router.post(
  '/reactivation/open',
  otpLimiter,
  reactivationTokenRules,
  validate,
  ctrl.openReactivation
);
router.post(
  '/reactivation/otp',
  otpLimiter,
  reactivationTokenRules,
  validate,
  ctrl.sendReactivationOtp
);
router.post(
  '/reactivation/submit',
  otpLimiter,
  reactivationSubmitRules,
  validate,
  ctrl.submitReactivation
);

router.post('/forgot-password', passwordResetLimiter, rules.forgotPasswordRules, validate, ctrl.forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, rules.resetPasswordRules, validate, ctrl.resetPassword);
router.post('/set-password', protect, passwordResetLimiter, rules.setPasswordRules, validate, ctrl.setPassword);
router.patch('/change-password', protect, rules.changePasswordRules, validate, ctrl.changePassword);

module.exports = router;
