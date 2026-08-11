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

/**
 * The photo / video picker inside the "write a review" dialog.
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
  const inputRef = useRef(null);
  const tempIdRef = useRef(0);

  const inFlight = Object.entries(uploads);
  const slotsLeft = REVIEW_MEDIA_MAX - value.length - inFlight.length;

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
      return t('reviews.mediaTooLarge', {
        name: file.name,
        size: Math.round(limit / (1024 * 1024)),
      });
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

  const handleFiles = async (fileList) => {
    const picked = Array.from(fileList || []);
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

  const openPicker = () => {
    if (inputRef.current) inputRef.current.value = ''; // allows re-picking the same file
    inputRef.current?.click();
  };

  const removeAt = (index) => onChange((current) => current.filter((_, i) => i !== index));

  return (
    <div>
      <span className="label">
        {t('reviews.mediaLabel')}{' '}
        <span className="font-normal text-ink-400">{t('reviews.optional')}</span>
      </span>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        hidden
        disabled={disabled}
        onChange={(e) => handleFiles(e.target.files)}
      />

      <div className="flex flex-wrap gap-2.5">
        {value.map((item, index) => (
          <figure
            key={item.publicId || item.url}
            className="relative h-20 w-20 overflow-hidden rounded-lg border border-ink-200 bg-ink-50"
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
                <Icon name="play" size={22} filled />
              </span>
            )}

            <button
              type="button"
              onClick={() => removeAt(index)}
              aria-label={t('reviews.mediaRemove')}
              className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full
                         bg-ink-900/70 text-white transition hover:bg-ink-900"
            >
              <Icon name="close" size={13} />
            </button>
          </figure>
        ))}

        {/* In-flight uploads hold their own tile so the grid never jumps. */}
        {inFlight.map(([tempId, upload]) => (
          <div
            key={tempId}
            className="relative h-20 w-20 overflow-hidden rounded-lg border border-ink-200 bg-ink-50"
          >
            {upload.isVideo ? (
              <video src={upload.preview} muted className="h-full w-full object-cover opacity-40" />
            ) : (
              <img src={upload.preview} alt="" className="h-full w-full object-cover opacity-40" />
            )}
            <span className="absolute inset-0 grid place-items-center text-xs font-bold text-brand-700">
              {upload.progress}%
            </span>
            <span
              className="absolute inset-x-0 bottom-0 h-1 bg-brand-600 transition-all"
              style={{ width: `${upload.progress}%` }}
              aria-hidden="true"
            />
          </div>
        ))}

        {slotsLeft > 0 && (
          <button
            type="button"
            onClick={openPicker}
            disabled={disabled}
            className="grid h-20 w-20 place-items-center gap-1 rounded-lg border border-dashed
                       border-ink-300 text-ink-400 transition hover:border-brand-500
                       hover:text-brand-600 disabled:opacity-50"
          >
            <Icon name="camera" size={20} />
            <span className="text-[11px] font-medium">{t('reviews.mediaAdd')}</span>
          </button>
        )}
      </div>

      <p className="mt-1.5 text-xs text-ink-400">
        {t('reviews.mediaHint', {
          max: REVIEW_MEDIA_MAX,
          imageSize: Math.round(MAX_REVIEW_IMAGE_BYTES / (1024 * 1024)),
          videoSize: Math.round(MAX_REVIEW_VIDEO_BYTES / (1024 * 1024)),
        })}
      </p>
    </div>
  );
}
