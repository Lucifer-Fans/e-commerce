import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Icon from '../common/Icon';
import { Skeleton } from '../common/Skeleton';
import { optimisedImage } from '../../utils/format';

/**
 * Horizontal category strip with hover mega-dropdowns. Entirely driven by the
 * categories collection — there is no hardcoded menu anywhere.
 */
export default function CategoryNav() {
  const { t } = useTranslation();
  const { categories, loading } = useSelector((s) => s.catalog);
  const [openId, setOpenId] = useState(null);
  const closeTimer = useRef(null);

  // A small delay stops the panel flickering while the pointer crosses the gap.
  const open = (id) => {
    clearTimeout(closeTimer.current);
    setOpenId(id);
  };
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpenId(null), 140);
  };

  if (loading && !categories.length) {
    return (
      <div className="border-b border-ink-200 bg-white">
        <div className="container-page flex gap-6 py-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-24" />
          ))}
        </div>
      </div>
    );
  }

  if (!categories.length) return null;

  return (
    <nav
      aria-label={t('a11y.productCategories')}
      className="relative z-10 border-b border-ink-200 bg-white"
    >
      <div className="container-page">
        <ul className="hide-scrollbar flex items-stretch gap-1 overflow-x-auto">
          <li>
            <Link
              to="/products"
              className="flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-semibold text-ink-700 hover:text-brand-600"
            >
              <Icon name="grid" size={16} />
              {t('nav.allProducts')}
            </Link>
          </li>

          {categories.map((category) => {
            const hasChildren = category.subCategories?.length > 0;
            const isOpen = openId === category._id;

            return (
              <li
                key={category._id}
                className="static"
                onMouseEnter={() => hasChildren && open(category._id)}
                onMouseLeave={scheduleClose}
              >
                <Link
                  to={`/products?category=${category.slug}`}
                  className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-sm font-medium transition ${
                    isOpen ? 'text-brand-600' : 'text-ink-700 hover:text-brand-600'
                  }`}
                  aria-expanded={hasChildren ? isOpen : undefined}
                >
                  {category.image?.url && (
                    <img
                      src={optimisedImage(category.image.url, { width: 40, height: 40 })}
                      alt=""
                      loading="lazy"
                      className="h-5 w-5 shrink-0 rounded-full object-cover"
                    />
                  )}
                  {category.name}
                  {hasChildren && (
                    <Icon
                      name="chevronDown"
                      size={14}
                      className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  )}
                </Link>

                {hasChildren && isOpen && (
                  <div
                    className="absolute left-0 right-0 top-full z-40 animate-fade-in border-t border-ink-200 bg-white shadow-card-hover"
                    onMouseEnter={() => open(category._id)}
                    onMouseLeave={scheduleClose}
                  >
                    <div className="container-page grid gap-x-8 gap-y-1 py-5 sm:grid-cols-3 lg:grid-cols-4">
                      <div className="sm:col-span-3 lg:col-span-1">
                        <p className="mb-1 text-sm font-bold text-ink-900">{category.name}</p>
                        {category.description && (
                          <p className="mb-3 text-xs leading-relaxed text-ink-500">
                            {category.description}
                          </p>
                        )}
                        <Link
                          to={`/products?category=${category.slug}`}
                          onClick={() => setOpenId(null)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                        >
                          {t('nav.shopAll', { category: category.name })}
                          <Icon name="chevronRight" size={13} />
                        </Link>
                      </div>

                      {category.subCategories.map((sub) => (
                        <Link
                          key={sub._id}
                          to={`/products?category=${category.slug}&subCategory=${sub.slug}`}
                          onClick={() => setOpenId(null)}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-600 transition hover:bg-brand-50 hover:text-brand-700"
                        >
                          {sub.image?.url && (
                            <img
                              src={optimisedImage(sub.image.url, { width: 48, height: 48 })}
                              alt=""
                              loading="lazy"
                              className="h-6 w-6 shrink-0 rounded object-cover"
                            />
                          )}
                          {sub.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
