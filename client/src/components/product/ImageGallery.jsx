import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { optimisedImage } from '../../utils/format';
import useMediaQuery from '../../hooks/useMediaQuery';
import Icon from '../common/Icon';
import ImageViewer from '../common/ImageViewer';

/** Below this width a tap opens the popup; above it the hover magnifier is enough. */
const DESKTOP = '(min-width: 1024px)';

/**
 * Product gallery: thumbnail rail plus a hover magnifier on desktop, and on
 * handheld widths a tap that opens the shared image popup. The magnifier moves a
 * scaled background rather than a second <img>, so there is no extra request.
 */
export default function ImageGallery({ images = [], alt = '' }) {
  const { t } = useTranslation(['shop', 'common']);
  const [active, setActive] = useState(0);
  const [zooming, setZooming] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [viewer, setViewer] = useState(false);
  const frameRef = useRef(null);
  const isDesktop = useMediaQuery(DESKTOP);

  if (!images.length) {
    return (
      <div className="grid aspect-square w-full place-items-center rounded-xl bg-ink-100 text-ink-300">
        <Icon name="emptyBox" size={56} />
      </div>
    );
  }

  const current = images[active];

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
        {images.length > 1 && (
          <div className="hide-scrollbar flex gap-2.5 overflow-x-auto sm:max-h-[520px] sm:flex-col sm:overflow-y-auto">
            {images.map((image, i) => (
              <button
                key={image.publicId || i}
                type="button"
                onClick={() => setActive(i)}
                onMouseEnter={() => setActive(i)}
                aria-label={t('gallery.viewImage', { index: i + 1 })}
                aria-current={i === active}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white transition sm:h-20 sm:w-20 ${
                  i === active ? 'border-brand-600' : 'border-ink-200 hover:border-ink-300'
                }`}
              >
                <img
                  src={optimisedImage(image.url, { width: 160, height: 160 })}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}

        <div className="relative flex-1">
          <div
            ref={frameRef}
            className="relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-xl border border-ink-200 bg-white"
            onMouseEnter={isDesktop ? () => setZooming(true) : undefined}
            onMouseLeave={isDesktop ? () => setZooming(false) : undefined}
            onMouseMove={isDesktop ? onMouseMove : undefined}
            // Desktop keeps the in-place magnifier; only handheld widths pop out.
            onClick={isDesktop ? undefined : () => setViewer(true)}
          >
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
          </div>
        </div>
      </div>

      <ImageViewer
        open={viewer && !isDesktop}
        images={images}
        index={active}
        onIndexChange={setActive}
        onClose={() => setViewer(false)}
        alt={alt}
      />
    </>
  );
}
