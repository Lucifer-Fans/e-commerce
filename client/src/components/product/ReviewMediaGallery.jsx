import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { optimisedImage } from '../../utils/format';
import Icon from '../common/Icon';
import Modal from '../common/Modal';

const thumbnailFor = (item) =>
  item.type === 'video' ? item.thumbnail : optimisedImage(item.url, { width: 200, height: 200 });

/** mm:ss, so a clip's tile says how long it runs before anyone opens it. */
function clipLength(seconds) {
  if (!seconds) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The photos and clips attached to a posted review: a thumbnail rail that opens
 * the tapped item full size. Videos are never loaded until one is opened —
 * the rail shows the poster frame Cloudinary derives from the clip.
 */
export default function ReviewMediaGallery({ media = [], authorName }) {
  const { t } = useTranslation('shop');
  const [openIndex, setOpenIndex] = useState(null);

  if (!media.length) return null;

  const active = openIndex === null ? null : media[openIndex];

  return (
    <>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {media.map((item, index) => (
          <button
            key={item.publicId || item.url}
            type="button"
            onClick={() => setOpenIndex(index)}
            aria-label={t('reviews.mediaViewAria', { index: index + 1 })}
            className="relative h-16 w-16 overflow-hidden rounded-lg border border-ink-200
                       bg-ink-50 transition hover:border-brand-500"
          >
            <img src={thumbnailFor(item)} alt="" loading="lazy" className="h-full w-full object-cover" />

            {item.type === 'video' && (
              <>
                <span
                  className="absolute inset-0 grid place-items-center bg-ink-900/30 text-white"
                  aria-hidden="true"
                >
                  <Icon name="play" size={18} filled />
                </span>
                {clipLength(item.duration) && (
                  <span className="absolute bottom-0.5 right-1 text-[10px] font-semibold text-white drop-shadow">
                    {clipLength(item.duration)}
                  </span>
                )}
              </>
            )}
          </button>
        ))}
      </div>

      <Modal
        open={active !== null}
        onClose={() => setOpenIndex(null)}
        title={t('reviews.mediaViewerTitle', { name: authorName || t('reviews.anonymous') })}
        size="lg"
      >
        {active?.type === 'video' ? (
          <video
            key={active.url}
            src={active.url}
            poster={active.thumbnail || undefined}
            controls
            autoPlay
            playsInline
            className="max-h-[60vh] w-full rounded-lg bg-ink-900"
          />
        ) : (
          active && (
            <img
              src={optimisedImage(active.url, { width: 1200, crop: 'limit' })}
              alt=""
              className="mx-auto max-h-[60vh] w-auto rounded-lg object-contain"
            />
          )
        )}

        {media.length > 1 && (
          <div className="hide-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {media.map((item, index) => (
              <button
                key={item.publicId || item.url}
                type="button"
                onClick={() => setOpenIndex(index)}
                aria-label={t('reviews.mediaViewAria', { index: index + 1 })}
                aria-current={index === openIndex}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition ${
                  index === openIndex ? 'border-brand-600' : 'border-ink-200'
                }`}
              >
                <img src={thumbnailFor(item)} alt="" loading="lazy" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}
