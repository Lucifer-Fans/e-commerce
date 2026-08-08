const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');
const env = require('../config/env');
const { uploadBuffer, destroyAsset } = require('../config/cloudinary');

function assertEnabled() {
  if (!env.cloudinaryEnabled) {
    throw ApiError.serviceUnavailable(
      'Image uploads are not configured. Add your Cloudinary credentials to the server .env file.'
    );
  }
}

const folderFor = (kind) => `${env.cloudinary.folder}/${kind || 'misc'}`;

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
 * DELETE /uploads/:publicId — public ids contain slashes, so the route uses a
 * wildcard and we rebuild the full id here.
 */
exports.deleteImage = asyncHandler(async (req, res) => {
  assertEnabled();
  const publicId = req.params.publicId || req.params[0];
  if (!publicId) throw ApiError.badRequest('publicId is required');

  // Confine deletions to this project's folder so a crafted id can't reach other assets.
  if (!publicId.startsWith(env.cloudinary.folder)) {
    throw ApiError.forbidden('You can only delete assets belonging to this store');
  }

  await destroyAsset(publicId);
  return sendSuccess(res, { message: 'Image deleted' });
});
