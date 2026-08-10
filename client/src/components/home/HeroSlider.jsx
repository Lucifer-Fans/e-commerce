import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { optimisedImage } from '../../utils/format';
import Icon from '../common/Icon';
import { Skeleton } from '../common/Skeleton';

const AUTOPLAY_MS = 6000;

/**
 * Admin-managed hero carousel. Renders nothing when no slides are published.
 * Slide copy itself is authored per-banner in the admin, so only the chrome —
 * arrows, dots and the default call to action — is translated here.
 */
export default function HeroSlider({ slides = [], loading = false }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef(null);

  const count = slides.length;
  const go = useCallback((next) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count <= 1) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [paused, count]);

  // Respect users who have asked for reduced motion.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (query.matches) setPaused(true);
  }, []);

  if (loading) {
    return (
      <div className="container-page pt-4">
        <Skeleton className="h-[240px] w-full rounded-xl sm:h-[320px] lg:h-[420px]" />
      </div>
    );
  }

  if (!count) return null;

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) go(index + (delta > 0 ? 1 : -1));
    touchStartX.current = null;
  };

  return (
    <div className="container-page pt-4">
      <section
        className="relative overflow-hidden rounded-xl bg-ink-900"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        aria-roledescription="carousel"
        aria-label={t('a11y.carousel')}
      >
        <div className="relative h-[240px] sm:h-[320px] lg:h-[420px]">
          {slides.map((slide, i) => (
            <div
              key={slide._id}
              className={`absolute inset-0 transition-opacity duration-700 ${
                i === index ? 'opacity-100' : 'pointer-events-none opacity-0'
              }`}
              aria-hidden={i !== index}
            >
              <picture>
                {slide.mobileImage?.url && (
                  <source media="(max-width: 640px)" srcSet={optimisedImage(slide.mobileImage.url, { width: 800 })} />
                )}
                <img
                  src={optimisedImage(slide.image.url, { width: 1600, height: 600 })}
                  alt={slide.title}
                  // The first slide is the LCP element — it must not be lazy.
                  loading={i === 0 ? 'eager' : 'lazy'}
                  // React 18 does not map camelCase `fetchPriority` to the DOM attribute.
                  fetchpriority={i === 0 ? 'high' : undefined}
                  className="h-full w-full object-cover"
                />
              </picture>

              <div
                className={`absolute inset-0 flex items-center bg-gradient-to-r ${
                  slide.theme === 'light'
                    ? 'from-white/90 via-white/60 to-transparent'
                    : 'from-ink-900/85 via-ink-900/55 to-transparent'
                }`}
              >
                <div className="max-w-xl px-6 sm:px-10 lg:px-14">
                  <h2
                    className={`mb-2 text-2xl font-extrabold leading-tight sm:text-4xl lg:text-5xl ${
                      slide.theme === 'light' ? 'text-ink-900' : 'text-white'
                    }`}
                  >
                    {slide.title}
                  </h2>
                  {slide.subtitle && (
                    <p
                      className={`mb-5 text-sm sm:text-base ${
                        slide.theme === 'light' ? 'text-ink-600' : 'text-ink-200'
                      }`}
                    >
                      {slide.subtitle}
                    </p>
                  )}
                  <Link to={slide.ctaLink || '/products'} className="btn-accent !px-6 !py-3">
                    {slide.ctaLabel || t('actions.shopNow')}
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-ink-700 shadow-md transition hover:bg-white sm:block"
              aria-label={t('a11y.previousSlide')}
            >
              <Icon name="chevronLeft" size={20} />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/90 p-2.5 text-ink-700 shadow-md transition hover:bg-white sm:block"
              aria-label={t('a11y.nextSlide')}
            >
              <Icon name="chevronRight" size={20} />
            </button>

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2">
              {slides.map((slide, i) => (
                <button
                  key={slide._id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={t('a11y.goToSlide', { index: i + 1 })}
                  aria-current={i === index}
                  className={`h-2 rounded-full transition-all ${
                    i === index ? 'w-7 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
