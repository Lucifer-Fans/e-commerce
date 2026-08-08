import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchWishlist } from '../store/wishlistSlice';
import { useLiveRefetch } from '../realtime/useRealtime';
import { CATALOG_EVENTS } from '../realtime/events';
import Seo from '../components/common/Seo';
import Breadcrumb from '../components/common/Breadcrumb';
import ProductGrid from '../components/product/ProductGrid';

export default function Wishlist() {
  const { t } = useTranslation(['checkout', 'common']);
  const dispatch = useDispatch();
  const { items, loading } = useSelector((s) => s.wishlist);

  useEffect(() => {
    dispatch(fetchWishlist());
  }, [dispatch]);

  // The list itself arrives over the socket, but the saved products' price and stock
  // are catalogue state — those need a re-read.
  useLiveRefetch(
    useCallback(() => dispatch(fetchWishlist()), [dispatch]),
    CATALOG_EVENTS
  );

  // A saved item keeps the option the shopper had chosen, so the tile shows that SKU's
  // price and links straight back to it rather than to the product's default.
  const products = items.map((item) =>
    item.variant
      ? {
          ...item.product,
          finalPrice: item.variant.finalPrice,
          price: item.variant.price,
          discountPercent: item.variant.discountPercent,
          stock: item.variant.stock,
          images: item.variant.images?.length ? item.variant.images : item.product.images,
          savedVariantSku: item.variant.sku,
          savedVariantLabel: item.variant.label,
        }
      : item.product
  );

  return (
    <>
      <Seo title={t('wishlist.title')} path="/wishlist" noIndex />

      <div className="container-page py-5">
        <Breadcrumb items={[{ label: t('common:nav.wishlist') }]} className="mb-4" />

        <h1 className="mb-5 text-xl font-bold text-ink-900 sm:text-2xl">
          {t('wishlist.title')}
          {products.length > 0 && (
            <span className="ml-2 text-base font-normal text-ink-500">
              ({t('cart.itemCount', { count: products.length })})
            </span>
          )}
        </h1>

        <ProductGrid
          products={products}
          loading={loading && !products.length}
          columns="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
          emptyTitle={t('wishlist.emptyTitle')}
          emptyMessage={t('wishlist.emptyMessage')}
          emptyAction={{ label: t('wishlist.browse'), to: '/products' }}
        />
      </div>
    </>
  );
}
