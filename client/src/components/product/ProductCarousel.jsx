import { useRef, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ProductCard from './ProductCard';
import { ProductCardSkeleton } from '../common/Skeleton';
import Icon from '../common/Icon';

/**
 * Horizontal product rail used for every homepage section. Native scroll-snap
 * handles touch; the arrows are a desktop affordance layered on top.
 */
export default function ProductCarousel({
  title,
  subtitle,
  products = [],
  loading = false,
  viewAllTo,
  skeletonCount = 5,
}) {
  const { t } = useTranslation();
  const trackRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const syncArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    syncArrows();
    const el = trackRef.current;
    if (!el) return undefined;

    el.addEventListener('scroll', syncArrows, { passive: true });
    window.addEventListener('resize', syncArrows);
    return () => {
      el.removeEventListener('scroll', syncArrows);
      window.removeEventListener('resize', syncArrows);
    };
  }, [syncArrows, products.length, loading]);

  const scrollBy = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * (el.clientWidth * 0.8), behavior: 'smooth' });
  };

  if (!loading && !products.length) return null;

  return (
    <section className="py-6">
      <div className="container-page">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="section-title">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>

          <div className="flex items-center gap-2">
            {viewAllTo && (
              <Link
                to={viewAllTo}
                className="hidden text-sm font-semibold text-brand-600 hover:text-brand-700 sm:block"
              >
                {t('actions.viewAll')}
              </Link>
            )}
            <div className="hidden gap-1.5 lg:flex">
              <button
                type="button"
                onClick={() => scrollBy(-1)}
                disabled={!canScrollLeft}
                className="btn-outline h-9 w-9 !px-0 disabled:opacity-40"
                aria-label={t('a11y.scrollLeft')}
              >
                <Icon name="chevronLeft" size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollBy(1)}
                disabled={!canScrollRight}
                className="btn-outline h-9 w-9 !px-0 disabled:opacity-40"
                aria-label={t('a11y.scrollRight')}
              >
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={trackRef}
          className="hide-scrollbar -mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-2"
        >
          {(loading ? Array.from({ length: skeletonCount }) : products).map((product, index) => (
            <div
              key={product?._id || index}
              className="w-[46%] shrink-0 snap-start sm:w-[31%] lg:w-[23%] xl:w-[18.5%]"
            >
              {loading ? <ProductCardSkeleton /> : <ProductCard product={product} />}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
