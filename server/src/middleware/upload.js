const multer = require('multer');
const ApiError = require('../utils/ApiError');

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/avif'];
const MAX_BYTES = 5 * 1024 * 1024;

// Memory storage: buffers stream straight to Cloudinary, nothing touches local disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 5 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(ApiError.badRequest('Only JPG, PNG, WEBP and AVIF images are allowed'));
    }
    cb(null, true);
  },
});

/* ---------------- Résumés (careers form) ---------------- */

const RESUME_MIMES = [
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];
const RESUME_MAX_BYTES = 5 * 1024 * 1024;

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RESUME_MAX_BYTES, files: 1 },
  fileFilter(_req, file, cb) {
    // Some browsers send an empty/generic mimetype for .doc, so the extension is
    // checked as well rather than rejecting a legitimate upload outright.
    const extensionOk = /\.(pdf|doc|docx)$/i.test(file.originalname || '');
    if (!RESUME_MIMES.includes(file.mimetype) && !extensionOk) {
      return cb(ApiError.badRequest('Only PDF, DOC and DOCX résumés are allowed'));
    }
    cb(null, true);
  },
});

module.exports = {
  uploadSingle: upload.single('image'),
  uploadMultiple: upload.array('images', 5),
  uploadResume: resumeUpload.single('resume'),
  MAX_BYTES,
  ALLOWED,
  RESUME_MAX_BYTES,
  RESUME_MIMES,
};
