import { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { catalogApi, productApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { CATALOG_EVENTS, EVENTS } from '../realtime/events';
import { getRecentlyViewed } from '../utils/recentlyViewed';
import useSettings from '../settings/useSettings';
import useLanguage from '../i18n/useLanguage';
import { consumeWelcomePending } from '../i18n/welcomePrompt';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import HeroSlider from '../components/home/HeroSlider';
import CategoryStrip from '../components/home/CategoryStrip';
import ProductCarousel from '../components/product/ProductCarousel';
import ErrorState from '../components/common/ErrorState';

export default function Home() {
  // `shop` streams in with this route chunk; `common` is already resolved.
  const { t } = useTranslation(['shop', 'common']);
  const { categories, loading: categoriesLoading } = useSelector((s) => s.catalog);
  const { siteName } = useSettings();
  const { openWelcome } = useLanguage();

  // The far end of the sign-up: a shopper who has just created and verified an
  // account is asked which language they want. An ordinary visit — first or
  // hundredth — leaves the flag unset and this does nothing.
  useEffect(() => {
    if (consumeWelcomePending()) openWelcome();
  }, [openWelcome]);

  const banners = useFetch(useCallback(() => catalogApi.banners('hero'), []), []);
  const feed = useFetch(useCallback(() => productApi.homeFeed(), []), []);

  // Every rail is derived from the catalogue, so any product change reshuffles them.
  useLiveRefetch(feed.refetch, CATALOG_EVENTS);
  useLiveRefetch(banners.refetch, EVENTS.BANNER_CHANGED);

  const [recent, setRecent] = useState([]);

  // Recently viewed is resolved from localStorage ids, so it survives logout.
  useEffect(() => {
    const ids = getRecentlyViewed();
    if (!ids.length) return;
    productApi
      .byIds(ids)
      .then((res) => setRecent(res.data.products))
      .catch(() => setRecent([]));
  }, []);

  const sections = feed.data?.data?.sections || [];

  return (
    <>
      <Seo
        title={t('home.seoTitle')}
        description={t('home.seoDescription')}
        path="/"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: siteName,
          potentialAction: {
            '@type': 'SearchAction',
            target: `${window.location.origin}/products?search={search_term_string}`,
            'query-input': 'required name=search_term_string',
          },
        }}
      />

      <HeroSlider slides={banners.data?.data?.banners || []} loading={banners.loading} />

      <CategoryStrip categories={categories} loading={categoriesLoading && !categories.length} />

      {feed.error ? (
        <ErrorState
          title={t('home.feedError')}
          message={feed.error.message}
          onRetry={feed.refetch}
        />
      ) : feed.loading ? (
        <>
          <ProductCarousel title={t('home.forYou')} loading />
          <ProductCarousel title={t('home.topSelling')} loading />
        </>
      ) : (
        sections.map((section) => (
          <div key={section.key}>
            {/* The API sends a stable `key` plus English copy; the heading itself is
                interface text, so it is translated here and the server's title is
                only the fallback. */}
            <ProductCarousel
              title={t(`home.sections.${section.key}.title`, section.title)}
              subtitle={t(`home.sections.${section.key}.subtitle`, section.subtitle)}
              products={section.products}
              viewAllTo={
                section.key === 'best_deals'
                  ? '/products?minDiscount=10&sort=discount'
                  : section.key === 'top_selling'
                    ? '/products?sort=popular'
                    : '/products?sort=newest'
              }
            />
          </div>
        ))
      )}

      {recent.length > 0 && (
        <ProductCarousel
          title={t('home.recentlyViewed')}
          subtitle={t('home.recentlyViewedSubtitle')}
          products={recent}
        />
      )}

      <section className="container-page py-10">
        <div className="overflow-hidden rounded-2xl bg-gradient-to-r from-ink-900 to-brand-800 px-6 py-10 text-center sm:px-12">
          <h2 className="mb-2 text-2xl font-extrabold text-white sm:text-3xl">{t('home.ctaTitle')}</h2>
          <p className="mx-auto mb-6 max-w-xl text-sm text-ink-200">
            {categories.length
              ? t('home.ctaText', { count: categories.length })
              : t('home.ctaTextAll')}
          </p>
          <Link to="/products" className="btn-accent !px-7 !py-3">
            {t('home.ctaButton')}
            <Icon name="chevronRight" size={16} />
          </Link>
        </div>
      </section>
    </>
  );
}
