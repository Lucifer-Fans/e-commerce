import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { optimisedImage } from '../../utils/format';
import useMediaQuery from '../../hooks/useMediaQuery';
import Icon from '../common/Icon';
import ImageViewer from '../common/ImageViewer';

/** Below this width a tap opens the popup; above it the hover magnifier is enough. */
const DESKTOP = '(min-width: 1024px)';
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** mm:ss on a clip's tile, so its length shows before anyone presses play. */
function clipLength(seconds) {
  if (!seconds) return null;
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Product gallery: thumbnail rail plus a hover magnifier on desktop, and on
 * handheld widths a tap that opens the shared image popup. The magnifier moves a
 * scaled background rather than a second <img>, so there is no extra request.
 *
 * Clips are appended after the photos and play in place — the magnifier and the
 * tap-to-enlarge are both off on a video slide, since the player owns those
 * gestures. Nothing but the poster frame loads until one is actually played.
 */
export default function ImageGallery({ images = [], videos = [], alt = '' }) {
  const { t } = useTranslation(['shop', 'common']);
  const [active, setActive] = useState(0);
  const [zooming, setZooming] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [viewer, setViewer] = useState(false);
  const frameRef = useRef(null);
  const isDesktop = useMediaQuery(DESKTOP);
  const reduceMotion = useMediaQuery(REDUCED_MOTION);

  const items = [
    ...images.map((image) => ({ ...image, type: 'image' })),
    ...videos.map((video) => ({ ...video, type: 'video' })),
  ];

  if (!items.length) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-xl bg-ink-100 text-ink-300">
        <Icon name="emptyBox" size={56} />
      </div>
    );
  }

  const current = items[Math.min(active, items.length - 1)];
  const isVideo = current.type === 'video';

  const onMouseMove = (e) => {
    const rect = frameRef.current.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <>
      <div className="flex flex-col-reverse gap-3 sm:flex-row">
        {items.length > 1 && (
          <div className="hide-scrollbar flex gap-2.5 overflow-x-auto sm:max-h-[520px] sm:flex-col sm:overflow-y-auto">
            {items.map((item, i) => (
              <button
                key={item.publicId || i}
                type="button"
                onClick={() => setActive(i)}
                // A clip is switched to deliberately, not by brushing past it.
                onMouseEnter={item.type === 'video' ? undefined : () => setActive(i)}
                aria-label={
                  item.type === 'video'
                    ? t('gallery.viewVideo', { index: i + 1 })
                    : t('gallery.viewImage', { index: i + 1 })
                }
                aria-current={i === active}
                className={`relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition sm:h-20 sm:w-20 ${
                  i === active ? 'border-brand-600' : 'border-ink-200 hover:border-ink-300'
                }`}
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
        )}

        <div className="relative flex-1">
          <div
            ref={frameRef}
            className={`relative aspect-square w-full overflow-hidden rounded-xl border border-ink-200 bg-white ${
              isVideo ? '' : 'cursor-zoom-in'
            }`}
            onMouseEnter={isDesktop && !isVideo ? () => setZooming(true) : undefined}
            onMouseLeave={isDesktop && !isVideo ? () => setZooming(false) : undefined}
            onMouseMove={isDesktop && !isVideo ? onMouseMove : undefined}
            // Desktop keeps the in-place magnifier; only handheld widths pop out.
            onClick={isDesktop || isVideo ? undefined : () => setViewer(true)}
          >
            {isVideo ? (
              <video
                // Keyed on the clip so switching thumbnails mounts a fresh player
                // rather than swapping the src on a element that is already playing.
                key={current.publicId || current.url}
                src={current.url}
                poster={current.thumbnail || undefined}
                controls
                playsInline
                loop
                // Browsers only honour autoplay when there is no sound; the shopper
                // can unmute from the controls. Anyone who has asked their system to
                // cut animation gets the poster and a play button instead.
                autoPlay={!reduceMotion}
                muted={!reduceMotion}
                preload={reduceMotion ? 'none' : 'auto'}
                className="h-full w-full bg-ink-900 object-contain"
              />
            ) : (
              <>
                <img
                  src={optimisedImage(current.url, { width: 900 })}
                  alt={current.alt || alt}
                  // The gallery hero is above the fold on the details page.
                  loading="eager"
                  className="h-full w-full object-contain transition-transform duration-200"
                  style={
                    zooming
                      ? { transform: 'scale(2)', transformOrigin: `${origin.x}% ${origin.y}%` }
                      : undefined
                  }
                />

                <span className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-ink-900/70 px-3 py-1.5 text-[11px] font-medium text-white">
                  <Icon name="zoom" size={13} />
                  {t('gallery.hoverToZoom')}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <ImageViewer
        open={viewer && !isDesktop}
        images={items}
        index={active}
        onIndexChange={setActive}
        onClose={() => setViewer(false)}
        alt={alt}
      />
    </>
  );
}
