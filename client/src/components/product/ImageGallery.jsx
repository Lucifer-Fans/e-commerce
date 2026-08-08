import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { optimisedImage } from '../../utils/format';
import Icon from '../common/Icon';

/**
 * Product gallery: thumbnail rail, hover magnifier on desktop, tap-to-zoom
 * lightbox on touch. The magnifier moves a scaled background rather than a second
 * <img>, so there is no extra network request.
 */
export default function ImageGallery({ images = [], alt = '' }) {
  const { t } = useTranslation(['shop', 'common']);
  const [active, setActive] = useState(0);
  const [zooming, setZooming] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [lightbox, setLightbox] = useState(false);
  const frameRef = useRef(null);

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

  const step = (delta) => setActive((i) => (i + delta + images.length) % images.length);

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
            onMouseEnter={() => setZooming(true)}
            onMouseLeave={() => setZooming(false)}
            onMouseMove={onMouseMove}
            onClick={() => setLightbox(true)}
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

          {images.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => step(-1)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/95 p-2 text-ink-700 shadow-md hover:bg-white sm:hidden"
                aria-label={t('gallery.previousImage')}
              >
                <Icon name="chevronLeft" size={18} />
              </button>
              <button
                type="button"
                onClick={() => step(1)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/95 p-2 text-ink-700 shadow-md hover:bg-white sm:hidden"
                aria-label={t('gallery.nextImage')}
              >
                <Icon name="chevronRight" size={18} />
              </button>
            </>
          )}
        </div>
      </div>

      {lightbox && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-ink-900/95 p-4"
          onClick={() => setLightbox(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t('gallery.enlarged')}
        >
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute right-5 top-5 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
            aria-label={t('common:actions.close')}
          >
            <Icon name="close" size={22} />
          </button>

          <img
            src={optimisedImage(current.url, { width: 1400, crop: 'limit' })}
            alt={current.alt || alt}
            className="max-h-full max-w-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
              {images.map((image, i) => (
                <button
                  key={image.publicId || i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActive(i);
                  }}
                  aria-label={t('gallery.image', { index: i + 1 })}
                  className={`h-2 rounded-full transition-all ${
                    i === active ? 'w-7 bg-white' : 'w-2 bg-white/40'
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
