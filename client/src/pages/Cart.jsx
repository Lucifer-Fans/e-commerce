import { useCallback, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { fetchCart } from '../store/cartSlice';
import { useLiveRefetch } from '../realtime/useRealtime';
import { CATALOG_EVENTS } from '../realtime/events';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import EmptyState from '../components/common/EmptyState';
import Breadcrumb from '../components/common/Breadcrumb';
import { ListRowSkeleton } from '../components/common/Skeleton';
import CartItemRow from '../components/cart/CartItemRow';
import PriceSummary from '../components/cart/PriceSummary';
import CouponBox from '../components/cart/CouponBox';

export default function Cart() {
  const { t } = useTranslation(['checkout', 'common']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, savedForLater, coupon, totals, loading, hasUnavailableItems } = useSelector(
    (s) => s.cart
  );

  useEffect(() => {
    dispatch(fetchCart());
  }, [dispatch]);

  /*
   * The cart itself arrives over the socket already, but its lines carry catalogue
   * data — price, discount, stock — that the cart document does not own. A repricing
   * or a sell-out elsewhere therefore leaves the totals and the availability warning
   * here wrong until a reload, so the cart is re-read whenever a product it holds
   * moves. Products not in the cart are ignored: a busy catalogue would otherwise
   * refetch this page constantly for lines it does not show.
   */
  const holdsProduct = useCallback(
    (payload) => {
      const productId = String(payload?.productId || '');
      if (!productId) return false;
      return [...items, ...savedForLater].some(
        (item) => String(item.product?._id || item.product || '') === productId
      );
    },
    [items, savedForLater]
  );

  useLiveRefetch(() => dispatch(fetchCart()), CATALOG_EVENTS, { filter: holdsProduct });

  const isEmpty = !loading && items.length === 0;
  const canCheckout = items.length > 0 && !items.every((i) => !i.inStock);

  return (
    <>
      <Seo title={t('cart.title')} path="/cart" noIndex />

      <div className="container-page py-5">
        <Breadcrumb items={[{ label: t('cart.title') }]} className="mb-4" />

        <h1 className="mb-5 text-xl font-bold text-ink-900 sm:text-2xl">
          {t('cart.title')}
          {items.length > 0 && (
            <span className="ml-2 text-base font-normal text-ink-500">
              ({t('cart.itemCount', { count: items.length })})
            </span>
          )}
        </h1>

        {loading && !items.length ? (
          <ListRowSkeleton rows={3} />
        ) : isEmpty && !savedForLater.length ? (
          <EmptyState
            icon="cart"
            title={t('cart.emptyTitle')}
            message={t('cart.emptyMessage')}
            actionLabel={t('cart.startShopping')}
            actionTo="/products"
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-5">
              {items.length > 0 && (
                <section className="card px-5 py-1">
                  {items.map((item) => (
                    <CartItemRow key={item._id} item={item} />
                  ))}
                </section>
              )}

              {isEmpty && savedForLater.length > 0 && (
                <EmptyState
                  icon="cart"
                  title={t('cart.emptyTitle')}
                  message={t('cart.emptyButSaved')}
                  actionLabel={t('cart.continueShopping')}
                  actionTo="/products"
                />
              )}

              {savedForLater.length > 0 && (
                <section className="card px-5 py-1">
                  <h2 className="border-b border-ink-100 py-4 text-sm font-bold text-ink-900">
                    {t('cart.savedForLater', { count: savedForLater.length })}
                  </h2>
                  {savedForLater.map((item) => (
                    <CartItemRow key={item._id} item={item} saved />
                  ))}
                </section>
              )}

              <Link
                to="/products"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                <Icon name="chevronLeft" size={15} />
                {t('cart.continueShopping')}
              </Link>
            </div>

            {items.length > 0 && (
              <div className="space-y-4 lg:sticky lg:top-[160px] lg:self-start">
                <CouponBox coupon={coupon} appliedDiscount={totals.couponDiscount} />

                <PriceSummary totals={totals} couponCode={coupon?.code}>
                  {hasUnavailableItems && (
                    <p className="mb-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
                      {t('cart.unavailableWarning')}
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => navigate('/checkout')}
                    disabled={!canCheckout}
                    className="btn-accent w-full !py-3.5 !text-base"
                  >
                    {t('cart.proceedToCheckout')}
                    <Icon name="chevronRight" size={17} />
                  </button>
                </PriceSummary>

                <div className="flex items-center justify-center gap-2 text-xs text-ink-500">
                  <Icon name="shield" size={14} className="text-success" />
                  {t('cart.securePayments')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
