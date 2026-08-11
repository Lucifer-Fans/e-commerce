const { v2: cloudinary } = require('cloudinary');
const env = require('./env');
const logger = require('../utils/logger');

if (env.cloudinaryEnabled) {
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
} else {
  logger.warn('Cloudinary credentials missing — image upload endpoints will return 503.');
}

/**
 * Upload a buffer (from multer memory storage) to Cloudinary.
 * Returns the trimmed shape we persist on products.
 */
function uploadBuffer(buffer, { folder = env.cloudinary.folder, publicId, tags = [] } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        tags,
        resource_type: 'image',
        overwrite: true,
        // Strip metadata, auto-pick format/quality — keeps storefront payloads small.
        transformation: [{ quality: 'auto:good', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Upload a video (review clips).
 *
 * `eager` is deliberately not used: transcoding a phone clip synchronously would
 * hold the request open for as long as the encode takes. Cloudinary streams the
 * original and derives everything else on first delivery, so the shopper gets
 * their upload back immediately and the poster frame below is generated the
 * first time a thumbnail is actually rendered.
 */
function uploadVideoBuffer(buffer, { folder = env.cloudinary.folder, tags = [] } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, tags, resource_type: 'video', overwrite: false },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          thumbnail: videoPosterUrl(result.public_id),
          width: result.width,
          height: result.height,
          duration: result.duration,
          format: result.format,
          bytes: result.bytes,
        });
      }
    );
    stream.end(buffer);
  });
}

/** A still frame from a video, sized for a thumbnail tile. */
function videoPosterUrl(publicId, { width = 400, height = 400 } = {}) {
  if (!publicId || !env.cloudinaryEnabled) return null;

  return cloudinary.url(publicId, {
    resource_type: 'video',
    format: 'jpg',
    secure: true,
    transformation: [{ width, height, crop: 'fill', quality: 'auto' }],
  });
}

/**
 * Upload a non-image document (résumés: PDF/DOC/DOCX).
 *
 * `resource_type: 'raw'` keeps the file byte-identical — none of the image
 * transformations above apply — and `type: 'authenticated'` is deliberately NOT
 * used: the panel links straight to the URL, and the ids are unguessable.
 */
function uploadRawBuffer(buffer, { folder = env.cloudinary.folder, fileName, tags = [] } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        tags,
        resource_type: 'raw',
        // Keeps the original extension in the delivery URL, so browsers and Word
        // both recognise what they are being handed.
        use_filename: Boolean(fileName),
        filename_override: fileName,
        unique_filename: true,
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          bytes: result.bytes,
          format: result.format || (fileName || '').split('.').pop(),
        });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Short-lived, signed download link for a raw asset.
 *
 * Cloudinary accounts restrict raw delivery by default, so the plain secure_url of a
 * résumé answers 401 — and we would not want a permanent public link to someone's CV
 * even if it did work. This signs an API download that expires in minutes, and the
 * server is the only thing that ever sees it.
 */
function privateDownloadUrl(publicId, { expiresInSeconds = 300 } = {}) {
  if (!publicId || !env.cloudinaryEnabled) return null;

  return cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type: 'upload',
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
  });
}

async function destroyAsset(publicId, { resourceType = 'image' } = {}) {
  if (!publicId || !env.cloudinaryEnabled) return null;
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    // A failed remote cleanup must never block the DB write that triggered it.
    logger.error(`Cloudinary destroy failed for ${publicId}: ${err.message}`);
    return null;
  }
}

/** Build a resized delivery URL without a second round trip. */
function transformedUrl(url, { width, height, crop = 'fill' } = {}) {
  if (!url || !url.includes('/upload/')) return url;
  const parts = [width && `w_${width}`, height && `h_${height}`, `c_${crop}`, 'q_auto', 'f_auto']
    .filter(Boolean)
    .join(',');
  return url.replace('/upload/', `/upload/${parts}/`);
}

module.exports = {
  cloudinary,
  uploadBuffer,
  uploadVideoBuffer,
  uploadRawBuffer,
  videoPosterUrl,
  destroyAsset,
  transformedUrl,
  privateDownloadUrl,
};
