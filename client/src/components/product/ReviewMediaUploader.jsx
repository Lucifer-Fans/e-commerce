import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { uploadApi } from '../../api/endpoints';
import { optimisedImage } from '../../utils/format';
import {
  REVIEW_MEDIA_MAX,
  REVIEW_IMAGE_TYPES,
  REVIEW_VIDEO_TYPES,
  MAX_REVIEW_IMAGE_BYTES,
  MAX_REVIEW_VIDEO_BYTES,
} from '../../utils/constants';
import Icon from '../common/Icon';

const ACCEPT = [...REVIEW_IMAGE_TYPES, ...REVIEW_VIDEO_TYPES].join(',');
const asMb = (bytes) => Math.round(bytes / (1024 * 1024));

/**
 * The photo / video picker inside the "write a review" dialog — the same styled
 * dropzone over a hidden native input that the careers form uses for résumés,
 * with a thumbnail rail underneath for what has been picked so far.
 *
 * Each file is uploaded on selection rather than on submit: the review itself
 * posts only URLs, so by the time the shopper presses Submit there is nothing
 * left to wait for. Uploads run in parallel and each tile carries its own
 * progress, so one slow clip never blocks the photos beside it.
 *
 * `value` is the array persisted on the review:
 *   [{ type: 'image' | 'video', url, publicId, thumbnail, width, height, duration }]
 *
 * `onChange` is always called with an updater function, so pass a `useState`
 * setter (or something that handles one) rather than a plain assignment.
 */
export default function ReviewMediaUploader({ value = [], onChange, onBusyChange, disabled }) {
  const { t } = useTranslation('shop');
  const [uploads, setUploads] = useState({}); // tempId -> { name, progress, preview, isVideo }
  const fileInput = useRef(null);
  const tempIdRef = useRef(0);

  const inFlight = Object.entries(uploads);
  const used = value.length + inFlight.length;
  const slotsLeft = REVIEW_MEDIA_MAX - used;

  // The dialog disables Submit while anything is still going up.
  const busy = inFlight.length > 0;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  const validate = (file) => {
    const isVideo = REVIEW_VIDEO_TYPES.includes(file.type);
    if (!isVideo && !REVIEW_IMAGE_TYPES.includes(file.type)) {
      return t('reviews.mediaBadType', { name: file.name });
    }
    const limit = isVideo ? MAX_REVIEW_VIDEO_BYTES : MAX_REVIEW_IMAGE_BYTES;
    if (file.size > limit) {
      return t('reviews.mediaTooLarge', { name: file.name, size: asMb(limit) });
    }
    return null;
  };

  const uploadOne = async (file, tempId) => {
    const preview = URL.createObjectURL(file);
    const isVideo = REVIEW_VIDEO_TYPES.includes(file.type);

    setUploads((current) => ({
      ...current,
      [tempId]: { name: file.name, progress: 0, preview, isVideo },
    }));

    try {
      const res = await uploadApi.media(file, {
        onProgress: (progress) =>
          setUploads((current) =>
            current[tempId] ? { ...current, [tempId]: { ...current[tempId], progress } } : current
          ),
      });
      return res.data.media;
    } finally {
      URL.revokeObjectURL(preview);
      setUploads((current) => {
        const next = { ...current };
        delete next[tempId];
        return next;
      });
    }
  };

  const pickFiles = async (e) => {
    const picked = Array.from(e.target.files || []);
    // Reset immediately so re-picking the same file still fires a change event.
    e.target.value = '';
    if (!picked.length) return;

    if (picked.length > slotsLeft) {
      toast.error(t('reviews.mediaTooMany', { max: REVIEW_MEDIA_MAX }));
    }

    const accepted = [];
    picked.slice(0, Math.max(slotsLeft, 0)).forEach((file) => {
      const problem = validate(file);
      if (problem) toast.error(problem);
      else accepted.push(file);
    });
    if (!accepted.length) return;

    const results = await Promise.allSettled(
      accepted.map((file) => uploadOne(file, `tmp-${(tempIdRef.current += 1)}`))
    );

    const uploaded = [];
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') uploaded.push(result.value);
      else {
        toast.error(
          result.reason?.message || t('reviews.mediaUploadFailed', { name: accepted[index].name })
        );
      }
    });

    // Appended through an updater rather than off `value`: a second batch picked
    // while this one was still uploading would otherwise overwrite the first.
    if (uploaded.length) {
      onChange((current) => [...current, ...uploaded].slice(0, REVIEW_MEDIA_MAX));
    }
  };

  const removeAt = (index) => onChange((current) => current.filter((_, i) => i !== index));

  return (
    <div>
      <span className="label">
        {t('reviews.mediaLabel')}{' '}
        <span className="font-normal text-ink-400">{t('reviews.optional')}</span>
      </span>

      <div className="rounded-lg border border-dashed border-ink-300 bg-ink-50/60 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={disabled || slotsLeft <= 0}
            className="btn-outline shrink-0 px-3 py-2 text-xs disabled:opacity-60"
          >
            <Icon name="camera" size={14} />
            {t('reviews.mediaAdd')}
          </button>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-500">
            {used
              ? t('reviews.mediaChosen', { used, max: REVIEW_MEDIA_MAX })
              : t('reviews.mediaNone')}
          </span>
        </div>

        {used > 0 && (
          <div className="hide-scrollbar mt-3 flex gap-2.5 overflow-x-auto">
            {value.map((item, index) => (
              <div
                key={item.publicId || item.url}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2
                           border-ink-200 bg-white"
              >
                <img
                  src={
                    item.type === 'video'
                      ? item.thumbnail
                      : optimisedImage(item.url, { width: 160, height: 160 })
                  }
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />

                {item.type === 'video' && (
                  <span
                    className="absolute inset-0 grid place-items-center bg-ink-900/30 text-white"
                    aria-hidden="true"
                  >
                    <Icon name="play" size={16} filled />
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label={t('reviews.mediaRemove')}
                  className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full
                             bg-ink-900/70 text-white transition hover:bg-danger"
                >
                  <Icon name="close" size={11} />
                </button>
              </div>
            ))}

            {/* In-flight uploads hold their own tile so the rail never jumps. */}
            {inFlight.map(([tempId, upload]) => (
              <div
                key={tempId}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2
                           border-ink-200 bg-white"
              >
                {upload.isVideo ? (
                  <video src={upload.preview} muted className="h-full w-full object-cover opacity-40" />
                ) : (
                  <img src={upload.preview} alt="" className="h-full w-full object-cover opacity-40" />
                )}
                <span className="absolute inset-0 grid place-items-center text-xs font-bold text-brand-600">
                  {upload.progress}%
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-2 text-center text-[11px] text-ink-400">
          {t('reviews.mediaHint', {
            max: REVIEW_MEDIA_MAX,
            imageSize: asMb(MAX_REVIEW_IMAGE_BYTES),
            videoSize: asMb(MAX_REVIEW_VIDEO_BYTES),
          })}
        </p>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        multiple
        onChange={pickFiles}
        className="sr-only"
      />
    </div>
  );
}
