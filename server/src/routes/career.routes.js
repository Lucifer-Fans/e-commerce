const express = require('express');
const ctrl = require('../controllers/career.controller');
const validate = require('../middleware/validate');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadResume } = require('../middleware/upload');
const { sanitizeMultipartBody } = require('../middleware/sanitize');
const { publicFormLimiter } = require('../middleware/rateLimiter');
const {
  jobApplicationRules,
  jobPositionRules,
  careerContactRules,
  applicationStatusRules,
  objectId,
  pagination,
} = require('../validators');

const router = express.Router();

/* ---------------- Public ---------------- */

// Open roles + experience options + HR contact, in one call for the careers page.
router.get('/config', ctrl.getCareerConfig);

// multipart/form-data: multer parses the body, so sanitising has to run again after it.
router.post(
  '/applications',
  publicFormLimiter,
  uploadResume,
  sanitizeMultipartBody,
  jobApplicationRules,
  validate,
  ctrl.createApplication
);

/* ---------------- Admin ---------------- */
router.use(protect, adminOnly);

router.patch('/config', careerContactRules, validate, ctrl.updateCareerConfig);

router.get('/positions', ctrl.listPositions);
router.post('/positions', jobPositionRules, validate, ctrl.createPosition);
router.patch('/positions/:id', objectId('id'), validate, ctrl.updatePosition);
router.delete('/positions/:id', objectId('id'), validate, ctrl.deletePosition);

router.get('/applications', pagination, validate, ctrl.listApplications);
router.get('/applications/:id', objectId('id'), validate, ctrl.getApplication);
router.get('/applications/:id/resume', objectId('id'), validate, ctrl.streamResume);
router.patch(
  '/applications/:id/status',
  objectId('id'),
  applicationStatusRules,
  validate,
  ctrl.updateApplicationStatus
);
router.delete('/applications/:id', objectId('id'), validate, ctrl.deleteApplication);

module.exports = router;
