const express = require('express');
const ctrl = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { authLimiter, otpLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const { auth: rules } = require('../validators');

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

router.post('/forgot-password', passwordResetLimiter, rules.forgotPasswordRules, validate, ctrl.forgotPassword);
router.post('/reset-password/:token', passwordResetLimiter, rules.resetPasswordRules, validate, ctrl.resetPassword);
router.post('/set-password', protect, passwordResetLimiter, rules.setPasswordRules, validate, ctrl.setPassword);
router.patch('/change-password', protect, rules.changePasswordRules, validate, ctrl.changePassword);

module.exports = router;
