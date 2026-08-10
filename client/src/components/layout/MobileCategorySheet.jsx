import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import useScrollLock from '../../hooks/useScrollLock';
import Icon from '../common/Icon';
import { Skeleton } from '../common/Skeleton';
import { optimisedImage } from '../../utils/format';

/** Circle/tile artwork with the same initial fallback the category strip uses. */
function CategoryArt({ category, className, rounded }) {
  return (
    <span
      className={`grid shrink-0 place-items-center overflow-hidden bg-white font-bold text-brand-600
                  ring-1 ring-ink-200 ${rounded} ${className}`}
    >
      {category.image?.url ? (
        <img
          src={optimisedImage(category.image.url, { width: 160, height: 160 })}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{category.name.charAt(0).toUpperCase()}</span>
      )}
    </span>
  );
}

/**
 * Full-screen category browser opened from the mobile bottom bar: parent
 * categories scroll down the left rail, the selected one's subcategories fill
 * the right pane. Same categories collection the desktop nav reads, so the
 * taxonomy stays admin-driven on both.
 *
 * It stops short of the bottom bar rather than covering it, so the bar keeps
 * working as the way back out — the pattern every large storefront app uses.
 */
export default function MobileCategorySheet({ open, onClose }) {
  const { t } = useTranslation();
  const { categories, loading } = useSelector((s) => s.catalog);
  const [selectedId, setSelectedId] = useState(null);
  // The two panes still scroll; the page underneath does not.
  const overlayRef = useScrollLock(open);

  useEffect(() => {
    if (!open) return undefined;

    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);

    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Start again from the first category the next time the sheet is opened.
  useEffect(() => {
    if (!open) setSelectedId(null);
  }, [open]);

  if (!open) return null;

  // Falls back to the first category, which also covers the first paint and any
  // selection that disappears when an admin edits the taxonomy mid-session.
  const active = categories.find((c) => c._id === selectedId) || categories[0] || null;
  const subCategories = active?.subCategories || [];

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('nav.shopByCategory')}
      className="fixed inset-x-0 top-0 z-[60] flex animate-fade-in flex-col bg-white
                 bottom-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden"
    >
      <div className="flex items-center justify-between border-b border-ink-200 bg-ink-900 px-4 py-3 text-white">
        <h2 className="text-sm font-bold uppercase tracking-wider">{t('nav.categories')}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-white/10"
          aria-label={t('a11y.closeMenu')}
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      {loading && !categories.length ? (
        <div className="flex min-h-0 flex-1">
          <div className="w-[92px] shrink-0 space-y-4 border-r border-ink-200 bg-ink-50 py-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <Skeleton className="h-11 w-11 rounded-full" />
                <Skeleton className="h-2.5 w-14" />
              </div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-3 content-start gap-3 p-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="aspect-square w-full rounded-xl" />
                <Skeleton className="h-2.5 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : !active ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div>
            <Icon name="emptyBox" size={40} className="mx-auto mb-3 text-ink-300" />
            <p className="text-sm font-medium text-ink-500">{t('empty.nothingHere')}</p>
            <Link to="/products" onClick={onClose} className="btn-primary mt-4">
              {t('nav.allProducts')}
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* ---------------- Parent categories ---------------- */}
          <nav
            aria-label={t('a11y.productCategories')}
            className="hide-scrollbar w-[92px] shrink-0 overflow-y-auto overscroll-contain border-r border-ink-200 bg-ink-50"
          >
            <Link
              to="/products"
              onClick={onClose}
              className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 border-b border-ink-200 px-1 py-3 text-[11px] font-semibold leading-tight text-ink-600"
            >
              <Icon name="grid" size={20} className="text-ink-400" />
              <span className="line-clamp-2 text-center">{t('nav.allProducts')}</span>
            </Link>

            {categories.map((category) => {
              const isActive = category._id === active._id;

              return (
                <button
                  key={category._id}
                  type="button"
                  onClick={() => setSelectedId(category._id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={`relative flex min-h-[84px] w-full flex-col items-center gap-1.5 px-1 py-3 text-[11px] leading-tight transition ${
                    isActive
                      ? 'bg-white font-semibold text-brand-600'
                      : 'font-medium text-ink-600 hover:bg-ink-100'
                  }`}
                >
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-0 h-full w-1 rounded-r-full bg-brand-600"
                    />
                  )}
                  <CategoryArt
                    category={category}
                    rounded="rounded-full"
                    className={`h-11 w-11 text-base ${isActive ? 'ring-brand-200' : ''}`}
                  />
                  <span className="line-clamp-2 text-center">{category.name}</span>
                </button>
              );
            })}
          </nav>

          {/* ---------------- Subcategories of the selection ---------------- */}
          <div className="hide-scrollbar min-w-0 flex-1 overflow-y-auto overscroll-contain">
            {/* The heading is the link, so "shop all" needs no second row of chrome. */}
            <Link
              to={`/products?category=${active.slug}`}
              onClick={onClose}
              className="flex items-center gap-1 px-4 pb-3 pt-4 text-base font-bold text-ink-900"
            >
              <span className="truncate">{active.name}</span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-brand-600" />
            </Link>

            {subCategories.length ? (
              <div className="grid grid-cols-3 gap-x-3 gap-y-4 px-4 pb-6">
                {subCategories.map((sub) => (
                  <Link
                    key={sub._id}
                    to={`/products?category=${active.slug}&subCategory=${sub.slug}`}
                    onClick={onClose}
                    className="group flex flex-col items-center gap-2 text-center"
                  >
                    <CategoryArt
                      category={sub}
                      rounded="rounded-xl"
                      className="aspect-square w-full text-xl transition group-hover:ring-brand-300"
                    />
                    <span className="line-clamp-2 text-[11px] font-medium leading-tight text-ink-700 group-hover:text-brand-600">
                      {sub.name}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="px-4 pb-6">
                {active.description && (
                  <p className="mb-4 text-xs leading-relaxed text-ink-500">{active.description}</p>
                )}
                <Link
                  to={`/products?category=${active.slug}`}
                  onClick={onClose}
                  className="btn-primary w-full"
                >
                  {t('nav.shopAll', { category: active.name })}
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
