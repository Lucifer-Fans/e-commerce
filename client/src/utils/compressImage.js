/** Anything wider or taller than this is downscaled before upload. */
const MAX_EDGE = 2000;
/** Below this a re-encode usually costs more quality than it saves bytes. */
const SKIP_UNDER_BYTES = 400 * 1024;
const QUALITY = 0.82;

const canvasToBlob = (canvas, type, quality) =>
  new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * Downscale and re-encode a photo in the browser before it is uploaded.
 *
 * A phone camera hands over 4–12MB for something no page ever shows above about
 * 1200px wide, and on a mobile connection those megabytes are the whole wait. The
 * original is returned untouched whenever compressing would not clearly help:
 * small files, GIFs (a canvas keeps only the first frame), a decode failure, or a
 * result that came out no smaller than what we started with.
 *
 * The output stays inside the formats the API accepts (JPG/PNG/GIF), and a PNG is
 * re-encoded as PNG so a transparent logo does not come back on a black square.
 */
export default async function compressImage(file) {
  if (!file?.type?.startsWith('image/') || file.type === 'image/gif') return file;
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

    const isPng = file.type === 'image/png';
    const type = isPng ? 'image/png' : 'image/jpeg';
    const blob = await canvasToBlob(canvas, type, QUALITY);
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${isPng ? 'png' : 'jpg'}`, {
      type,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
