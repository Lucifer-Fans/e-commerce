import { uploadApi } from '../api/endpoints';

/**
 * Media upload helpers.
 *
 * Two things dominate how long an upload feels, and both are handled here:
 *
 * 1. **Bytes.** A phone photo is 4–12MB of pixels no storefront ever shows at that
 *    size, so it is resized and re-encoded in the browser first — usually a 10–30×
 *    reduction, which is the single biggest win available.
 * 2. **Hops.** Everything used to travel browser → API → Cloudinary, so the whole
 *    file was carried twice and the API request stayed open for both legs. The panel
 *    now posts straight to Cloudinary with a short-lived signature the server issues,
 *    which removes the middle leg entirely — the one that matters most for video,
 *    where there is nothing to compress away.
 *
 * The server route is kept as a fallback: if signing is unavailable (Cloudinary not
 * configured, signature request refused) the upload still completes the old way.
 */

/** Anything wider or taller than this is downscaled before upload. */
const MAX_EDGE = 2000;
/** Below this a re-encode usually costs more quality than it saves bytes. */
const SKIP_UNDER_BYTES = 400 * 1024;
const JPEG_QUALITY = 0.82;

/** Signatures stay valid for about an hour; re-issue well before that. */
const SIGNATURE_TTL_MS = 25 * 60 * 1000;
const signatureCache = new Map(); // kind -> { promise, issuedAt }

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Downscale and re-encode an image in the browser.
 *
 * Returns the original file untouched whenever compressing would not clearly help:
 * small files, GIFs (a canvas keeps only the first frame), or a result that came
 * out no smaller than what we started with.
 */
export async function compressImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size <= SKIP_UNDER_BYTES) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    // Stay inside the formats the API accepts (JPG/PNG/GIF). A PNG is re-encoded as
    // PNG — logos and shop marks are transparent, and JPEG would flatten that onto
    // black; everything else becomes a JPEG, which is where the byte savings are.
    const isPng = file.type === 'image/png';
    const type = isPng ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(canvas, type, JPEG_QUALITY);
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + (isPng ? '.png' : '.jpg'), {
      type,
      lastModified: file.lastModified,
    });
  } catch {
    // A decode failure is not worth failing the upload over — send the original.
    return file;
  }
}

/** A cached upload signature for this folder, refreshed before Cloudinary expires it. */
function getSignature(kind) {
  const cached = signatureCache.get(kind);
  if (cached && Date.now() - cached.issuedAt < SIGNATURE_TTL_MS) return cached.promise;

  const promise = uploadApi.signature(kind).then((res) => res.data.upload);
  signatureCache.set(kind, { promise, issuedAt: Date.now() });
  // A failed request must not be remembered, or every later upload reuses the failure.
  promise.catch(() => signatureCache.delete(kind));

  return promise;
}

/** The trimmed asset shape products are saved with — the same one the API returns. */
const assetFrom = (result) => ({
  url: result.secure_url,
  publicId: result.public_id,
  width: result.width,
  height: result.height,
  format: result.format,
  bytes: result.bytes,
  ...(result.resource_type === 'video'
    ? { duration: result.duration, thumbnail: posterFrom(result) }
    : {}),
});

/**
 * Poster frame for a clip, derived from its delivery URL.
 *
 * Cloudinary generates it on first request, so this is just URL arithmetic — the
 * same shape `videoPosterUrl` builds server-side.
 */
function posterFrom(result) {
  if (!result.secure_url?.includes('/upload/')) return undefined;
  return result.secure_url
    .replace('/upload/', '/upload/w_400,h_400,c_fill,q_auto/')
    .replace(/\.[^./]+$/, '.jpg');
}

/** POST straight to Cloudinary, reporting progress as the bytes leave the browser. */
function postToCloudinary(file, signed, resourceType, onProgress) {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    form.append('api_key', signed.apiKey);
    form.append('timestamp', signed.timestamp);
    form.append('signature', signed.signature);
    // Must match the signed parameters exactly, or Cloudinary rejects the request.
    form.append('folder', signed.folder);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${signed.cloudName}/${resourceType}/upload`);

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) return;
      onProgress(Math.round((event.loaded * 100) / event.total));
    };

    xhr.onload = () => {
      let body = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300 && body) resolve(body);
      else reject(new Error(body?.error?.message || `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));

    xhr.send(form);
  });
}

/**
 * Upload one photo or clip and resolve to the asset shape a product is saved with.
 *
 * `kind` is the Cloudinary sub-folder ('products', 'banners', …), not the file type;
 * the file type is taken from the file itself.
 */
export async function uploadMedia(file, { kind = 'products', onProgress } = {}) {
  const isVideo = file.type.startsWith('video/');
  const payload = isVideo ? file : await compressImage(file);

  try {
    const signed = await getSignature(kind);
    const result = await postToCloudinary(payload, signed, isVideo ? 'video' : 'image', onProgress);
    return assetFrom(result);
  } catch {
    // Signing unavailable or the direct post refused: retry through the server so the
    // upload still completes, just by the slower route.
    onProgress?.(0);
    const res = isVideo
      ? await uploadApi.video(payload, { kind, onProgress })
      : await uploadApi.image(payload, { kind, onProgress });
    const { type, ...asset } = res.data.media || res.data.image;
    return asset;
  }
}
