const { body, param } = require('express-validator');
const env = require('../config/env');
const { weaknessOf } = require('../utils/weakPassword');

const password = (field = 'password') =>
  body(field)
    .isLength({ min: 8, max: 72 })
    .withMessage('Password must be 8-72 characters')
    .matches(/[a-z]/)
    .withMessage('Password must contain a lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/\d/)
    .withMessage('Password must contain a number')
    /**
     * Character classes alone still admit `Password1`. This last check refuses the
     * guesses an attacker spends their first attempts on, and anything built out of
     * the account's own name or email. The identity comes from the request body when
     * signing up and from the session on the change-password paths.
     */
    .custom((value, { req }) => {
      const reason = weaknessOf(value, {
        email: req.body?.email || req.user?.email,
        name: req.body?.name || req.user?.name,
      });
      if (reason) throw new Error(reason);
      return true;
    });

exports.registerRules = [
  body('name').trim().isLength({ min: 2, max: 60 }).withMessage('Name must be 2-60 characters'),
  body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('phone').optional({ values: 'falsy' }).matches(/^[6-9]\d{9}$/).withMessage('Enter a valid 10 digit mobile number'),
  password(),
  body('confirmPassword')
    .optional()
    .custom((value, { req }) => value === req.body.password)
    .withMessage('Passwords do not match'),
];

/**
 * The code is digits and nothing else, checked against the configured length so a
 * deployment that widens it does not have to remember to edit this file too.
 * `normalizeEmail` matches every other rule here — the address has to arrive in
 * the same shape registration stored it in, or the lookup misses.
 */
exports.verifyEmailRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('otp')
    .trim()
    .matches(new RegExp(`^\\d{${env.otp.length}}$`))
    .withMessage(`Enter the ${env.otp.length}-digit code we emailed you`),
];

exports.resendOtpRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
];

exports.loginRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

exports.googleLoginRules = [
  body('credential').isString().trim().notEmpty().withMessage('Google credential is required'),
];

exports.forgotPasswordRules = [
  body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
];

exports.resetPasswordRules = [
  param('token').isLength({ min: 20 }).withMessage('Invalid reset token'),
  password(),
];

exports.setPasswordRules = [password()];

// Session ids are UUIDs minted by the token layer, so anything else is a client bug
// or a probe — either way it should never reach a database query.
exports.sessionIdRules = [
  param('sessionId').isUUID().withMessage('Invalid session id'),
];

exports.changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  password('newPassword'),
  body('newPassword')
    .custom((value, { req }) => value !== req.body.currentPassword)
    .withMessage('New password must be different from the current one'),
];
