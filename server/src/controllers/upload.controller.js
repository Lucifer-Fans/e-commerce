const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const env = require('../config/env');
const { uploadBuffer, uploadVideoBuffer, destroyAsset, signUpload } = require('../config/cloudinary');
const { MAX_BYTES, VIDEO_ALLOWED } = require('../middleware/upload');

function assertEnabled() {
  if (!env.cloudinaryEnabled) {
    throw ApiError.serviceUnavailable(
      'Image uploads are not configured. Add your Cloudinary credentials to the server .env file.'
    );
  }
}

/**
 * `kind` is a client-supplied field, and on the review route that client is any
 * signed-in shopper — so it is reduced to a plain slug rather than pasted into a
 * path as sent. Everything still lands under this store's folder, which is what
 * the delete endpoint scopes itself to.
 */
const folderFor = (kind) => {
  const slug = String(kind || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${env.cloudinary.folder}/${slug || 'misc'}`;
};

/**
 * POST /uploads/image  (field: image)
 * The admin uploader posts one file per slot so each card can show its own progress bar.
 */
exports.uploadImage = asyncHandler(async (req, res) => {
  assertEnabled();
  if (!req.file) throw ApiError.badRequest('No image received');

  const image = await uploadBuffer(req.file.buffer, { folder: folderFor(req.body.kind) });

  return sendSuccess(res, { statusCode: 201, message: 'Image uploaded', data: { image } });
});

/** POST /uploads/images  (field: images, max 5) */
exports.uploadImages = asyncHandler(async (req, res) => {
  assertEnabled();
  if (!req.files?.length) throw ApiError.badRequest('No images received');

  const images = await Promise.all(
    req.files.map((file) => uploadBuffer(file.buffer, { folder: folderFor(req.body.kind) }))
  );

  return sendSuccess(res, {
    statusCode: 201,
    message: `${images.length} image(s) uploaded`,
    data: { images },
  });
});

/**
 * POST /uploads/media  (field: file)
 *
 * One photo *or* one short video, for shoppers attaching evidence to a review.
 * Images ride the same pipeline as everything else; videos keep their original
 * bytes and get a poster frame derived on delivery.
 */
exports.uploadMedia = asyncHandler(async (req, res) => {
  assertEnabled();
  if (!req.file) throw ApiError.badRequest('No file received');

  const isVideo = VIDEO_ALLOWED.includes(req.file.mimetype);
  // multer's cap is the video one; images are held to the tighter limit here.
  if (!isVideo && req.file.size > MAX_BYTES) {
    throw ApiError.badRequest('Image is too large (max 5MB)');
  }

  const folder = folderFor(req.body.kind);
  const asset = isVideo
    ? await uploadVideoBuffer(req.file.buffer, { folder })
    : await uploadBuffer(req.file.buffer, { folder });

  return sendSuccess(res, {
    statusCode: 201,
    message: isVideo ? 'Video uploaded' : 'Image uploaded',
    data: { media: { type: isVideo ? 'video' : 'image', ...asset } },
  });
});

/**
 * POST /uploads/signature (admin)
 *
 * Hands the panel a short-lived signature so a photo or clip can go straight from
 * the browser to Cloudinary. The signature is bound to the folder derived here —
 * the client cannot widen it — and Cloudinary rejects it about an hour after it
 * was issued, so a leaked one is worth nothing for long.
 */
exports.createUploadSignature = asyncHandler(async (req, res) => {
  assertEnabled();

  const signed = signUpload({ folder: folderFor(req.body.kind) });

  return sendSuccess(res, { message: 'Upload signature issued', data: { upload: signed } });
});

/**
 * DELETE /uploads/:publicId — public ids contain slashes, so the route uses a
 * wildcard and we rebuild the full id here.
 *
 * Cloudinary keeps images and videos in separate namespaces, so `?type=video`
 * says which one to destroy; without it a clip's id would match nothing.
 */
exports.deleteImage = asyncHandler(async (req, res) => {
  assertEnabled();
  const publicId = req.params.publicId || req.params[0];
  if (!publicId) throw ApiError.badRequest('publicId is required');
  const resourceType = req.query.type === 'video' ? 'video' : 'image';

  // Confine deletions to this project's folder so a crafted id can't reach other assets.
  if (!publicId.startsWith(env.cloudinary.folder)) {
    throw ApiError.forbidden('You can only delete assets belonging to this store');
  }

  await destroyAsset(publicId, { resourceType });
  return sendSuccess(res, { message: resourceType === 'video' ? 'Video deleted' : 'Image deleted' });
});
