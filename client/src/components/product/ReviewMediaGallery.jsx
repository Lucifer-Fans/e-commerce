import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { optimisedImage } from '../../utils/format';
import Icon from '../common/Icon';
import ImageViewer from '../common/ImageViewer';

const thumbnailFor = (item) =>
  item.type === 'video' ? item.thumbnail : optimisedImage(item.url, { width: 160, height: 160 });

/** mm:ss, so a clip's tile says how long it runs before anyone opens it. */
function clipLength(seconds) {
  if (!seconds) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * The photos and clips attached to a posted review — the same thumbnail rail the
 * product gallery uses, opening the shared media sheet on tap. Videos load no
 * bytes until one is opened: the rail shows the poster frame Cloudinary derives
 * from the clip.
 */
export default function ReviewMediaGallery({ media = [], alt = '' }) {
  const { t } = useTranslation('shop');
  const [active, setActive] = useState(0);
  const [viewer, setViewer] = useState(false);

  if (!media.length) return null;

  return (
    <>
      <div className="hide-scrollbar mt-2.5 flex gap-2.5 overflow-x-auto">
        {media.map((item, i) => (
          <button
            key={item.publicId || item.url}
            type="button"
            onClick={() => {
              setActive(i);
              setViewer(true);
            }}
            aria-label={t('reviews.mediaViewAria', { index: i + 1 })}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 border-ink-200
                       bg-white transition hover:border-ink-300"
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

      <ImageViewer
        open={viewer}
        images={media}
        index={active}
        onIndexChange={setActive}
        onClose={() => setViewer(false)}
        alt={alt}
      />
    </>
  );
}
