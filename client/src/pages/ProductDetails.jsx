import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { productApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import useCartActions from '../hooks/useCartActions';
import useVariantSelection from '../hooks/useVariantSelection';
import useSettings from '../settings/useSettings';
import { useLiveRefetch, useRealtimeRoom } from '../realtime/useRealtime';
import { CATALOG_EVENTS, REVIEW_EVENTS, rooms } from '../realtime/events';
import { pushRecentlyViewed, getRecentlyViewed } from '../utils/recentlyViewed';
import { formatPrice, primaryImageOf } from '../utils/format';
import { variantLabel } from '../utils/variants';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import Rating from '../components/common/Rating';
import Breadcrumb from '../components/common/Breadcrumb';
import QuantitySelector from '../components/common/QuantitySelector';
import ErrorState from '../components/common/ErrorState';
import { ProductDetailSkeleton } from '../components/common/Skeleton';
import ImageGallery from '../components/product/ImageGallery';
import ProductTabs from '../components/product/ProductTabs';
import ProductCarousel from '../components/product/ProductCarousel';
import VariantSelector from '../components/product/VariantSelector';
import WishlistButton from '../components/product/WishlistButton';

const FREE_DELIVERY_THRESHOLD = 499;

/**
 * The delivery strip reads off the selected SKU: whether *this* combination clears the
 * free-delivery threshold on its own, and what it weighs — both of which can differ
 * between a 128 GB and a 512 GB unit of the same phone.
 */
const deliveryPoints = ({ finalPrice, weight, t }) => {
  const shipsFree = finalPrice >= FREE_DELIVERY_THRESHOLD;
  return [
    {
      id: 'delivery',
      icon: 'truck',
      title: t(shipsFree ? 'details.delivery.freeTitle' : 'details.delivery.paidTitle'),
      text: shipsFree
        ? t('details.delivery.freeText')
        : t('details.delivery.paidText', { amount: FREE_DELIVERY_THRESHOLD }),
    },
    {
      id: 'returns',
      icon: 'refresh',
      title: t('details.delivery.returnsTitle'),
      text: t('details.delivery.returnsText'),
    },
    {
      id: 'payment',
      icon: 'shield',
      title: t('details.delivery.paymentTitle'),
      text: t('details.delivery.paymentText'),
    },
    weight?.value
      ? {
          id: 'weight',
          icon: 'package',
          title: t('details.delivery.weightTitle'),
          text: `${weight.value} ${weight.unit || 'g'}`,
        }
      : {
          id: 'genuine',
          icon: 'package',
          title: t('details.delivery.genuineTitle'),
          text: t('details.delivery.genuineText'),
        },
  ];
};

export default function ProductDetails() {
  const { t } = useTranslation(['shop', 'common']);
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { handleAddToCart, handleBuyNow } = useCartActions();
  const { siteName } = useSettings();

  const [quantity, setQuantity] = useState(1);
  const [recent, setRecent] = useState([]);

  const { data, loading, error, refetch } = useFetch(
    useCallback(() => productApi.detail(slug), [slug]),
    [slug]
  );

  const product = data?.data?.product;

  /**
   * The chosen combination drives the gallery, the price, the stock line, the delivery
   * promise and the buy buttons — all of it swaps in place, with no reload. `?v=<sku>`
   * makes a specific SKU shareable and crawlable.
   */
  const {
    hasVariants,
    attributes,
    variants,
    selection,
    select,
    variant,
    images,
    pricing,
    incomplete,
  } = useVariantSelection(product, { initialSku: searchParams.get('v') });

  const related = useFetch(
    useCallback(() => productApi.related(product._id), [product?._id]),
    [product?._id],
    { enabled: Boolean(product?._id) }
  );

  // Joining the product's room means stock, price and rating changes arrive here
  // even though the page was reached by slug rather than id.
  useRealtimeRoom(product?._id ? rooms.product(product._id) : null);

  // The buy box shows live stock and price, so it follows any change to this product
  // — including the ratings summary a new review recomputes.
  useLiveRefetch(refetch, [...CATALOG_EVENTS, ...REVIEW_EVENTS], {
    enabled: Boolean(product?._id),
    filter: (payload) => payload?.productId === product?._id,
  });

  // Record the visit, then resolve the *previously* viewed ids for the rail below.
  useEffect(() => {
    if (!product?._id) return;
    setQuantity(1);

    const previous = getRecentlyViewed().filter((id) => id !== product._id);
    pushRecentlyViewed(product._id);

    if (!previous.length) return setRecent([]);
    productApi
      .byIds(previous)
      .then((res) => setRecent(res.data.products))
      .catch(() => setRecent([]));
  }, [product?._id]);

  // Keep the URL on the SKU being viewed, without stacking history entries as the shopper
  // tries colours — so a copied link, a refresh and the back button all behave.
  useEffect(() => {
    if (!variant?.sku || searchParams.get('v') === variant.sku) return;
    const next = new URLSearchParams(searchParams);
    next.set('v', variant.sku);
    setSearchParams(next, { replace: true });
  }, [variant?.sku, searchParams, setSearchParams]);

  // Changing variant can lower the ceiling on quantity — clamp instead of erroring later.
  useEffect(() => {
    setQuantity((current) => Math.min(Math.max(1, current), Math.max(1, Math.min(pricing.stock, 10))));
  }, [pricing.stock]);

  /**
   * WhatsApp and friends render `text` and then the link on its own line, so the message
   * reads "Take a look at this <product> (<the chosen options>) on <store>" above the URL —
   * the SKU is named in words as well as carried by `?v=`, so the receiver sees the same
   * combination the sender was looking at.
   */
  const share = async () => {
    const options =
      (variant?.attributes || []).map((a) => a.value).join(', ') || variantLabel(variant);
    const name = options ? `${product.name} (${options})` : product.name;
    const text = t('details.shareText', { product: name, app: siteName });
    const url = window.location.href;

    try {
      if (navigator.share) await navigator.share({ title: name, text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        toast.success(t('details.linkCopied'));
      }
    } catch {
      /* the user dismissed the share sheet */
    }
  };

  if (loading) return <ProductDetailSkeleton />;

  if (error) {
    return (
      <div className="container-page py-12">
        <ErrorState
          title={t(error.status === 404 ? 'details.notFoundTitle' : 'details.loadErrorTitle')}
          message={error.status === 404 ? t('details.notFoundMessage') : error.message}
          onRetry={error.status === 404 ? undefined : refetch}
        />
        {error.status === 404 && (
          <div className="text-center">
            <button type="button" onClick={() => navigate('/products')} className="btn-primary">
              {t('details.browseAll')}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (!product) return null;

  // Everything below reads the *selected* combination, falling back to the product itself
  // when it has no variants — so a single set of markup serves both kinds of product.
  const { outOfStock, lowStock, savings, price, finalPrice, discountPercent, stock, sku } = pricing;
  const selectedLabel = variant ? variantLabel(variant) : '';
  const cantBuy = outOfStock || incomplete;

  // Spec rows that belong to the SKU rather than the product — the chosen attribute pairs
  // plus whatever logistics data the admin entered against this exact unit.
  const { length, width, height, unit: dimensionUnit } = variant?.dimensions || {};
  const variantSpecs = [
    ...(variant?.attributes || []).map((a) => ({ key: a.name, value: a.value })),
    ...(variant?.weight?.value
      ? [{ key: t('details.specWeight'), value: `${variant.weight.value} ${variant.weight.unit || 'g'}` }]
      : []),
    ...(length || width || height
      ? [
          {
            key: t('details.specDimensions'),
            value: `${[length, width, height].filter(Boolean).join(' × ')} ${dimensionUnit || 'cm'}`,
          },
        ]
      : []),
  ];

  return (
    <>
      <Seo
        title={
          selectedLabel
            ? `${product.meta?.title || product.name} — ${selectedLabel}`
            : product.meta?.title || product.name
        }
        description={product.meta?.description || product.shortDescription}
        keywords={product.meta?.keywords || product.tags}
        image={images[0]?.url || primaryImageOf(product)}
        // Canonical stays the product, never the SKU: every variant is the same page, and
        // splitting them would compete with itself in search results.
        path={`/product/${product.slug}`}
        type="product"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          image: (images.length ? images : product.images)?.map((i) => i.url),
          description: product.shortDescription,
          sku: sku || undefined,
          brand: product.brand ? { '@type': 'Brand', name: product.brand } : undefined,
          // A varied product publishes the whole price range plus one Offer per SKU, which
          // is what lets a search result read "₹1,299 – ₹1,899" instead of a single number.
          offers: hasVariants
            ? {
                '@type': 'AggregateOffer',
                priceCurrency: 'INR',
                lowPrice: product.variantSummary?.minPrice ?? finalPrice,
                highPrice: product.variantSummary?.maxPrice ?? finalPrice,
                offerCount: variants.length,
                availability: product.stock > 0
                  ? 'https://schema.org/InStock'
                  : 'https://schema.org/OutOfStock',
                offers: variants.map((v) => ({
                  '@type': 'Offer',
                  sku: v.sku,
                  name: variantLabel(v),
                  price: v.finalPrice,
                  priceCurrency: 'INR',
                  availability: v.inStock
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
                  url: `${window.location.origin}/product/${product.slug}?v=${v.sku}`,
                })),
              }
            : {
                '@type': 'Offer',
                price: finalPrice,
                priceCurrency: 'INR',
                availability: outOfStock
                  ? 'https://schema.org/OutOfStock'
                  : 'https://schema.org/InStock',
                url: window.location.href,
              },
          aggregateRating: product.ratings?.count
            ? {
                '@type': 'AggregateRating',
                ratingValue: product.ratings.average,
                reviewCount: product.ratings.count,
              }
            : undefined,
        }}
      />

      <div className="container-page py-5">
        <Breadcrumb
          items={[
            { label: t('common:nav.products'), to: '/products' },
            ...(product.category
              ? [{ label: product.category.name, to: `/products?category=${product.category.slug}` }]
              : []),
            ...(product.subCategory
              ? [
                  {
                    label: product.subCategory.name,
                    to: `/products?category=${product.category?.slug}&subCategory=${product.subCategory.slug}`,
                  },
                ]
              : []),
            { label: product.name },
          ]}
          className="mb-5"
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-12">
          <div className="lg:sticky lg:top-[160px] lg:self-start">
            {/* Keyed on the SKU so picking a colour resets the gallery to its first shot
                rather than leaving a stale thumbnail selected. */}
            <ImageGallery
              key={variant?.sku || product._id}
              images={images}
              alt={selectedLabel ? `${product.name} — ${selectedLabel}` : product.name}
            />
          </div>

          <div>
            {product.brand && (
              <Link
                to={`/products?brand=${encodeURIComponent(product.brand)}`}
                className="text-xs font-bold uppercase tracking-wider text-brand-600 hover:underline"
              >
                {product.brand}
              </Link>
            )}

            <div className="mb-2 mt-1 flex items-start justify-between gap-4">
              <h1 className="text-xl font-bold leading-snug text-ink-900 sm:text-2xl">
                {product.name}
              </h1>
              <div className="flex shrink-0 gap-2">
                {/* Saving remembers the option on screen, so "move to cart" later
                    restores that exact SKU instead of asking again. */}
                <WishlistButton product={product} variant={variant} className="h-10 w-10" size={19} />
                <button
                  type="button"
                  onClick={share}
                  className="grid h-10 w-10 place-items-center rounded-full bg-white text-ink-400 shadow-sm ring-1 ring-ink-200 transition hover:text-brand-600"
                  aria-label={t('details.share')}
                >
                  <Icon name="share" size={18} />
                </button>
              </div>
            </div>

            {product.ratings?.count > 0 ? (
              <div className="mb-4 flex items-center gap-2">
                <Rating value={product.ratings.average} size={16} showValue={false} />
                <span className="rounded bg-success px-1.5 py-0.5 text-xs font-bold text-white">
                  {product.ratings.average.toFixed(1)} ★
                </span>
                <span className="text-sm text-ink-500">
                  {t('details.ratingsCount', { count: product.ratings.count })}
                </span>
              </div>
            ) : (
              <p className="mb-4 text-sm text-ink-400">{t('details.noRatings')}</p>
            )}

            {/* Price, stock and delivery all follow the selected SKU — aria-live so a
                screen reader hears the new price when a chip is picked, not just sees it. */}
            <div className="mb-4 rounded-xl border border-ink-200 bg-ink-50 p-4" aria-live="polite">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-extrabold text-ink-900">
                  {formatPrice(finalPrice, { precise: true })}
                </span>
                {discountPercent > 0 && (
                  <>
                    <span className="text-lg text-ink-400 line-through">{formatPrice(price)}</span>
                    <span className="rounded-md bg-danger px-2 py-1 text-xs font-bold text-white">
                      {t('common:product.discountOff', { percent: Math.round(discountPercent) })}
                    </span>
                  </>
                )}
              </div>
              {savings > 0 && (
                <p className="mt-1.5 text-sm font-semibold text-success">
                  {t('details.youSave', { amount: formatPrice(savings, { precise: true }) })}
                </p>
              )}
              {/* Scarcity sits with the price, where the decision is being made — and only
                  once the SKU's own stock has fallen to the admin's threshold. */}
              {lowStock && (
                <p className="mt-1.5 text-sm font-bold text-accent-dark">
                  {t('details.hurryLeft', { count: stock })}
                </p>
              )}
            </div>

            {/* Only states the shopper has to act on are called out — a plain "In stock"
                repeats what the enabled buy buttons already say, and low stock now speaks
                for itself in the price box above. */}
            {(incomplete || outOfStock) && (
              <div className="mb-5 flex flex-wrap items-center gap-2">
                <span
                  className={`badge ${
                    incomplete
                      ? 'bg-ink-100 text-ink-600 ring-ink-200'
                      : 'bg-red-50 text-danger ring-red-200'
                  }`}
                >
                  {incomplete ? t('details.selectAnOption') : t('common:product.outOfStock')}
                </span>
              </div>
            )}

            {product.shortDescription && (
              <p className="mb-5 text-sm leading-relaxed text-ink-600">{product.shortDescription}</p>
            )}

            {hasVariants && (
              <VariantSelector
                attributes={attributes}
                variants={variants}
                selection={selection}
                onSelect={select}
                className="mb-6 border-y border-ink-100 py-5"
              />
            )}

            {!cantBuy && (
              <div className="mb-5 flex items-center gap-4">
                <span className="text-sm font-medium text-ink-700">{t('common:a11y.quantity')}</span>
                <QuantitySelector
                  value={quantity}
                  max={Math.min(stock, 10)}
                  onChange={setQuantity}
                />
              </div>
            )}

            {/* Below `lg` the same two actions live in the bar pinned to the bottom of
                the viewport, so they stay in reach however far the shopper has scrolled. */}
            <div className="mb-6 hidden gap-3 sm:flex-row lg:flex">
              <button
                type="button"
                onClick={() => handleAddToCart(product, quantity, variant)}
                disabled={cantBuy}
                className="btn-outline flex-1 !py-3.5 !text-base"
              >
                <Icon name="cart" size={18} />
                {t('common:product.addToCart')}
              </button>
              <button
                type="button"
                onClick={() => handleBuyNow(product, quantity, variant)}
                disabled={cantBuy}
                className="btn-accent flex-1 !py-3.5 !text-base"
              >
                {t('common:product.buyNow')}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {deliveryPoints({ finalPrice, weight: variant?.weight, t }).map((point) => (
                <div key={point.id} className="text-center">
                  <span className="mx-auto mb-1.5 grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-600">
                    <Icon name={point.icon} size={18} />
                  </span>
                  <p className="text-xs font-semibold text-ink-800">{point.title}</p>
                  <p className="text-[11px] leading-tight text-ink-500">{point.text}</p>
                </div>
              ))}
            </div>

            {(product.features?.length > 0 || variantSpecs.length > 0) && (
              <div className="mt-6 rounded-xl border border-ink-200 p-4">
                <p className="mb-3 text-sm font-bold text-ink-900">{t('details.keySpecs')}</p>
                <dl className="grid gap-x-8 sm:grid-cols-2">
                  {/* The chosen combination's own facts come first — they are what changed. */}
                  {[...variantSpecs, ...(product.features || []).slice(0, 6)].map((feature, i) => (
                    <div key={i} className="flex border-b border-ink-100 py-2 last:border-0">
                      <dt className="w-1/2 shrink-0 text-xs text-ink-500">{feature.key}</dt>
                      <dd className="flex-1 text-xs font-semibold text-ink-800">{feature.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>

        <ProductTabs product={product} />
      </div>

      <ProductCarousel
        title={t('details.relatedTitle')}
        subtitle={t('details.relatedSubtitle')}
        products={related.data?.data?.products || []}
        loading={related.loading}
      />

      {recent.length > 0 && (
        <ProductCarousel title={t('home.recentlyViewed')} products={recent} />
      )}

      {/* Room for the fixed bar below, so the last carousel never ends underneath it.
          This route drops the four-tab nav (see mobileNavScope), so nothing stacks. */}
      <div aria-hidden="true" className="h-[calc(4.5rem+env(safe-area-inset-bottom))] lg:hidden" />

      <div
        className="fixed inset-x-0 bottom-0 z-[70] border-t border-ink-200 bg-white
                   shadow-[0_-2px_12px_rgba(15,23,42,.1)] lg:hidden"
      >
        {/* Padding rather than margin, so the white ground reaches past the home indicator. */}
        <div className="flex items-stretch gap-3 px-3 pb-[calc(0.625rem+env(safe-area-inset-bottom))] pt-2.5">
          <button
            type="button"
            onClick={() => handleAddToCart(product, quantity, variant)}
            disabled={cantBuy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-brand-600 bg-white
                       py-3 text-sm font-bold text-brand-600 transition active:scale-[.98]
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="cart" size={20} />
            {t('common:product.addToCart')}
          </button>

          <button
            type="button"
            onClick={() => handleBuyNow(product, quantity, variant)}
            disabled={cantBuy}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-3 text-sm
                       font-bold text-white shadow-sm transition hover:bg-accent-dark active:scale-[.98]
                       disabled:cursor-not-allowed disabled:opacity-60"
          >
            {/* Two chevrons nested into a ▶▶ mark, from the same single-path icon set. */}
            <span aria-hidden="true" className="flex items-center -space-x-2">
              <Icon name="chevronRight" size={18} />
              <Icon name="chevronRight" size={18} />
            </span>
            {t('common:product.buyNow')}
          </button>
        </div>
      </div>
    </>
  );
}
