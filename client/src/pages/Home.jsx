import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { catalogApi, productApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { useLiveRefetch } from '../realtime/useRealtime';
import { CATALOG_EVENTS, EVENTS } from '../realtime/events';
import { fetchCategories, refreshCategories } from '../store/catalogSlice';
import { getRecentlyViewed } from '../utils/recentlyViewed';
import useSettings from '../settings/useSettings';
import useLanguage from '../i18n/useLanguage';
import { consumeWelcomePending } from '../i18n/welcomePrompt';
import Seo from '../components/common/Seo';
import HeroSlider from '../components/home/HeroSlider';
import CategoryStrip from '../components/home/CategoryStrip';
import ProductCarousel from '../components/product/ProductCarousel';
import ErrorState from '../components/common/ErrorState';
import SectionError from '../components/common/SectionError';

/**
 * The home page is three independent loads — banners, the category taxonomy and the
 * product rails — and they are kept independent on purpose: one of them failing
 * leaves the other two on screen, each reporting only itself.
 *
 * What they share is the retry. Whichever band the shopper clicks "Try again" on
 * re-runs *every* band that is currently failing, because "the page didn't load" is
 * one problem to the person looking at it, and repairing a third of it per click was
 * the bug that made a browser refresh feel mandatory.
 */
export default function Home() {
  // `shop` streams in with this route chunk; `common` is already resolved.
  const { t } = useTranslation(['shop', 'common']);
  const dispatch = useDispatch();
  const {
    categories,
    loading: categoriesLoading,
    loaded: categoriesLoaded,
    error: categoriesError,
  } = useSelector((s) => s.catalog);
  const { siteName } = useSettings();
  const { openWelcome } = useLanguage();

  // The far end of the sign-up: a shopper who has just created and verified an
  // account is asked which language they want. An ordinary visit — first or
  // hundredth — leaves the flag unset and this does nothing.
  useEffect(() => {
    if (consumeWelcomePending()) openWelcome();
  }, [openWelcome]);

  /*
   * Categories are fetched once for the whole app in <App>, which means a load that
   * failed during boot has no second chance — the effect there depends on `dispatch`
   * alone and never runs again, so the strip stayed empty until a manual refresh.
   *
   * Asking again here costs nothing: the thunk's condition guard drops the dispatch
   * once the taxonomy is in the store, so this only does work when there is nothing
   * to show, which is exactly the case that was stuck.
   */
  useEffect(() => {
    dispatch(fetchCategories());
  }, [dispatch]);

  const banners = useFetch(useCallback(() => catalogApi.banners('hero'), []), []);

  // Recently viewed is resolved from localStorage ids, so it survives logout. Read
  // once into state so the list is a stable dependency rather than a new array on
  // every render.
  const [recentIds] = useState(getRecentlyViewed);

  /*
   * The "For You" rail is computed per shopper, so the feed carries both halves of
   * who is asking: the session (sent automatically, read server-side from the cart,
   * wishlist and past orders) and these ids, which are the only taste signal a
   * signed-out visitor has. Signing in or out therefore has to re-ask — the rail it
   * returned a moment ago was built for somebody else.
   */
  const isAuthenticated = useSelector((s) => s.auth.isAuthenticated);
  const feed = useFetch(
    useCallback(() => productApi.homeFeed(recentIds), [recentIds]),
    [recentIds, isAuthenticated]
  );

  // Every rail is derived from the catalogue, so any product change reshuffles them.
  useLiveRefetch(feed.refetch, CATALOG_EVENTS);
  useLiveRefetch(banners.refetch, EVENTS.BANNER_CHANGED);

  const recent = useFetch(
    useCallback(() => productApi.byIds(recentIds), [recentIds]),
    [recentIds],
    { enabled: recentIds.length > 0 }
  );

  const sections = feed.data?.data?.sections || [];
  const slides = banners.data?.data?.banners || [];
  const recentProducts = recent.data?.data?.products || [];

  const { error: bannersError, refetch: refetchBanners } = banners;
  const { error: feedError, refetch: refetchFeed } = feed;

  /*
   * A band counts as failed only when it has nothing to render. A live refetch that
   * fails behind an already-populated rail is not worth replacing that rail with an
   * apology — the shopper keeps the slightly stale copy and the next socket event or
   * revisit corrects it.
   */
  const bannersFailed = Boolean(bannersError) && !slides.length;
  const categoriesFailed = Boolean(categoriesError) && !categories.length;
  const feedFailed = Boolean(feedError) && !sections.length;

  const retryFailed = useCallback(() => {
    if (bannersError) refetchBanners();
    if (feedError) refetchFeed();
    /*
     * `refreshCategories` rather than `fetchCategories`: the cached-already guard on
     * the latter is the wrong instinct for a button whose entire job is "ask again".
     * It has no guard of its own though, so the in-flight check lives here — a retry
     * fired for a *different* band must not stack a second categories request on top
     * of one that is already running.
     */
    if (!categoriesLoading && (categoriesError || !categoriesLoaded)) {
      dispatch(refreshCategories());
    }
  }, [
    bannersError,
    refetchBanners,
    feedError,
    refetchFeed,
    categoriesError,
    categoriesLoaded,
    categoriesLoading,
    dispatch,
  ]);

  const seoJsonLd = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${window.location.origin}/products?search={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    }),
    [siteName]
  );

  return (
    <>
      <Seo
        title={t('home.seoTitle')}
        description={t('home.seoDescription')}
        path="/"
        jsonLd={seoJsonLd}
      />

      {bannersFailed ? (
        <SectionError
          className="pt-4"
          title={t('home.bannersError')}
          message={bannersError.message}
          onRetry={retryFailed}
        />
      ) : (
        <HeroSlider slides={slides} loading={banners.loading} />
      )}

      {categoriesFailed ? (
        <SectionError
          className="py-6"
          title={t('home.categoriesError')}
          message={categoriesError}
          onRetry={retryFailed}
        />
      ) : (
        <CategoryStrip categories={categories} loading={categoriesLoading && !categories.length} />
      )}

      {feedFailed ? (
        <ErrorState
          title={t('home.feedError')}
          message={feedError.message}
          onRetry={retryFailed}
        />
      ) : feed.loading && !sections.length ? (
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

      {/* The quietest band on the page: it is a convenience built from ids this
          browser already had, so a failure just leaves it out rather than asking
          the shopper to do anything about it. */}
      {recentProducts.length > 0 && (
        <ProductCarousel
          title={t('home.recentlyViewed')}
          subtitle={t('home.recentlyViewedSubtitle')}
          products={recentProducts}
        />
      )}
    </>
  );
}
