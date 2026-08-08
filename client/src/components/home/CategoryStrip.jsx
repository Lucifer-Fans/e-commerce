import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { optimisedImage } from '../../utils/format';
import { Skeleton } from '../common/Skeleton';

/** Circular category shortcuts under the hero — pure DB content. */
export default function CategoryStrip({ categories = [], loading = false }) {
  const { t } = useTranslation();

  if (loading) {
    return (
      <div className="container-page py-6">
        <div className="hide-scrollbar flex gap-6 overflow-x-auto">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex shrink-0 flex-col items-center gap-2">
              <Skeleton className="h-16 w-16 rounded-full sm:h-20 sm:w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!categories.length) return null;

  return (
    <section className="py-6" aria-label={t('nav.shopByCategory')}>
      <div className="container-page">
        <div className="hide-scrollbar flex gap-5 overflow-x-auto pb-1 sm:gap-8 sm:justify-center">
          {categories.map((category) => (
            <Link
              key={category._id}
              to={`/products?category=${category.slug}`}
              className="group flex w-[76px] shrink-0 flex-col items-center gap-2 text-center sm:w-24"
            >
              <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-white text-2xl font-bold text-brand-600 shadow-card ring-1 ring-ink-200 transition group-hover:-translate-y-1 group-hover:shadow-card-hover sm:h-20 sm:w-20 sm:text-3xl">
                {category.image?.url ? (
                  <img
                    src={optimisedImage(category.image.url, { width: 160, height: 160 })}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  // No artwork uploaded yet — the initial keeps the circle from reading as broken.
                  <span aria-hidden="true">{category.name.charAt(0).toUpperCase()}</span>
                )}
              </span>
              <span className="line-clamp-2 text-xs font-medium leading-tight text-ink-700 group-hover:text-brand-600">
                {category.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
