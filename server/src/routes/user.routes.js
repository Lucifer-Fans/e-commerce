const express = require('express');
const ctrl = require('../controllers/user.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimiter');
const {
  profileRules,
  languageRules,
  userStatusRules,
  userRoleRules,
  objectId,
  pagination,
} = require('../validators');

const router = express.Router();

router.use(protect);

router.patch('/me', profileRules, validate, ctrl.updateProfile);
router.patch('/me/language', languageRules, validate, ctrl.updateLanguage);
router.post('/me/avatar', uploadLimiter, uploadSingle, ctrl.updateAvatar);
router.delete('/me/avatar', ctrl.removeAvatar);
router.delete('/me', ctrl.deactivateAccount);

router.use(adminOnly);
router.get('/', pagination, validate, ctrl.listUsers);
router.get('/:id', objectId('id'), validate, ctrl.getUser);
router.patch('/:id/status', objectId('id'), userStatusRules, validate, ctrl.updateUserStatus);
router.patch('/:id/role', objectId('id'), userRoleRules, validate, ctrl.updateUserRole);

module.exports = router;
