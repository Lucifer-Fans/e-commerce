import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { productApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { CATALOG_EVENTS } from '../realtime/events';
import { SORT_OPTIONS } from '../utils/constants';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import Breadcrumb from '../components/common/Breadcrumb';
import Pagination from '../components/common/Pagination';
import ErrorState from '../components/common/ErrorState';
import ProductGrid from '../components/product/ProductGrid';
import FilterSidebar from '../components/product/FilterSidebar';

const FILTER_KEYS = [
  'category', 'subCategory', 'brand', 'minPrice', 'maxPrice',
  'minDiscount', 'minRating', 'availability', 'search',
];

/**
 * The URL is the single source of truth for filters, so a filtered view is
 * shareable, bookmarkable and survives a refresh or a back-button press.
 */
export default function ProductList() {
  const { t } = useTranslation(['shop', 'common']);
  const [searchParams, setSearchParams] = useSearchParams();
  const categories = useSelector((s) => s.catalog.categories);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filters = useMemo(() => {
    const result = {};
    FILTER_KEYS.forEach((key) => {
      const value = searchParams.get(key);
      if (value) result[key] = value;
    });
    return result;
  }, [searchParams]);

  const page = Number(searchParams.get('page')) || 1;
  const sort = searchParams.get('sort') || 'newest';

  const queryParams = useMemo(() => ({ ...filters, page, sort, limit: 12 }), [filters, page, sort]);

  const { data, loading, error, refetch } = useFetch(
    useCallback(() => productApi.list(queryParams), [queryParams]),
    [queryParams]
  );

  const metaQuery = useFetch(
    useCallback(() => productApi.filterMeta(filters), [filters]),
    [filters]
  );

  // The grid and the sidebar counts are both derived from the same catalogue.
  useLiveRefetch(refetch, CATALOG_EVENTS);
  useLiveRefetch(metaQuery.refetch, CATALOG_EVENTS);

  const products = data?.data?.products || [];
  const meta = data?.meta;
  const filterMeta = metaQuery.data?.data;

  const updateParams = (patch, { resetPage = true } = {}) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === '' || value === null) next.delete(key);
      else next.set(key, String(value));
    });
    if (resetPage) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const resetFilters = () => {
    const next = new URLSearchParams();
    // A search term is the user's intent, not a filter — it survives "reset all".
    if (filters.search) next.set('search', filters.search);
    setSearchParams(next, { replace: true });
  };

  const activeCategory = categories.find((c) => c.slug === filters.category);
  const activeSubCategory = activeCategory?.subCategories?.find((s) => s.slug === filters.subCategory);

  const heading = filters.search
    ? t('list.resultsFor', { term: filters.search })
    : activeSubCategory?.name || activeCategory?.name || t('common:nav.allProducts');

  const crumbs = [
    { label: t('common:nav.products'), to: '/products' },
    ...(activeCategory ? [{ label: activeCategory.name, to: `/products?category=${activeCategory.slug}` }] : []),
    ...(activeSubCategory ? [{ label: activeSubCategory.name }] : []),
  ];

  /*
   * Chip labels: values that come from a fixed set get a translation, everything
   * else is catalogue data (a brand or category slug) and is shown as authored.
   */
  const chipLabel = (key, value) => {
    if (key === 'availability') return t(`filters.availability.${value}`, String(value));
    if (key === 'minPrice') return t('filters.chipMinPrice', { value });
    if (key === 'maxPrice') return t('filters.chipMaxPrice', { value });
    if (key === 'minDiscount') return t('filters.chipDiscount', { value });
    if (key === 'minRating') return t('filters.chipRating', { value });
    return String(value).replace(/_/g, ' ');
  };

  const activeChips = Object.entries(filters)
    .filter(([key]) => key !== 'search')
    .map(([key, value]) => ({ key, value }));

  return (
    <>
      <Seo
        title={heading}
        description={activeCategory?.description || t('list.seoDescription', { heading })}
        path={`/products?${searchParams.toString()}`}
      />

      <div className="container-page py-5">
        <Breadcrumb items={crumbs} className="mb-4" />

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-ink-900 sm:text-2xl">{heading}</h1>
            <p className="mt-0.5 text-sm text-ink-500">
              {loading ? t('list.loading') : t('list.found', { count: meta?.total ?? 0 })}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(true)}
              className="btn-outline lg:hidden"
            >
              <Icon name="filter" size={16} />
              {t('filters.title')}
              {activeChips.length > 0 && (
                <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">
                  {activeChips.length}
                </span>
              )}
            </button>

            <label className="flex items-center gap-2 text-sm">
              <span className="hidden text-ink-500 sm:block">{t('list.sortBy')}</span>
              <select
                value={sort}
                onChange={(e) => updateParams({ sort: e.target.value })}
                className="input !w-auto !py-2 text-sm"
                aria-label={t('list.sortAria')}
              >
                {SORT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {t(`sort.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {activeChips.map(({ key, value }) => (
              <button
                key={key}
                type="button"
                onClick={() => updateParams({ [key]: undefined })}
                aria-label={t('filters.removeFilter', { name: chipLabel(key, value) })}
                className="badge bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100"
              >
                {chipLabel(key, value)}
                <Icon name="close" size={12} className="ml-1.5" />
              </button>
            ))}
            <button
              type="button"
              onClick={resetFilters}
              className="text-xs font-semibold text-ink-500 underline hover:text-danger"
            >
              {t('common:actions.clearAll')}
            </button>
          </div>
        )}

        <div className="flex gap-6">
          <div className="hidden w-64 shrink-0 lg:block">
            <div className="card sticky top-[152px] max-h-[calc(100vh-172px)] overflow-y-auto px-4 py-3">
              <FilterSidebar
                filters={filters}
                onChange={updateParams}
                onReset={resetFilters}
                meta={filterMeta}
              />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {error ? (
              <ErrorState message={error.message} onRetry={refetch} />
            ) : (
              <>
                <ProductGrid
                  products={products}
                  loading={loading}
                  skeletonCount={12}
                  columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-4"
                  emptyTitle={t('list.emptyTitle')}
                  emptyMessage={t('list.emptyMessage')}
                  emptyAction={{ label: t('filters.reset'), onClick: resetFilters }}
                />

                {meta?.totalPages > 1 && (
                  <Pagination
                    page={page}
                    totalPages={meta.totalPages}
                    onChange={(next) => updateParams({ page: next }, { resetPage: false })}
                    className="mt-8"
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-[95] lg:hidden">
          <div
            className="absolute inset-0 bg-ink-900/50"
            onClick={() => setMobileFiltersOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] animate-slide-up overflow-y-auto rounded-t-2xl bg-white">
            <div className="sticky top-0 flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3">
              <h2 className="text-base font-bold text-ink-900">{t('filters.title')}</h2>
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100"
                aria-label={t('filters.close')}
              >
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="px-4 pb-4">
              <FilterSidebar
                filters={filters}
                onChange={updateParams}
                onReset={resetFilters}
                meta={filterMeta}
              />
            </div>

            <div className="sticky bottom-0 border-t border-ink-200 bg-white p-4">
              <button
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
                className="btn-primary w-full"
              >
                {t('filters.showCount', { count: meta?.total ?? 0 })}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
