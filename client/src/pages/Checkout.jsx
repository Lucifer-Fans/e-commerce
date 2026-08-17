import { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { Trans, useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { addressApi, orderApi, paymentApi } from '../api/endpoints';
import { fetchCart } from '../store/cartSlice';
import useFetch from '../hooks/useFetch';
import { loadRazorpayScript, openRazorpayCheckout } from '../utils/razorpay';
import { formatPrice, optimisedImage, primaryImageOf } from '../utils/format';
import useSettings from '../settings/useSettings';
import { useLiveRefetch } from '../realtime/useRealtime';
import { CATALOG_EVENTS, EVENTS } from '../realtime/events';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import Spinner from '../components/common/Spinner';
import Breadcrumb from '../components/common/Breadcrumb';
import EmptyState from '../components/common/EmptyState';
import { ListRowSkeleton } from '../components/common/Skeleton';
import AddressForm from '../components/checkout/AddressForm';
import OrderConfirmAnimation from '../components/checkout/OrderConfirmAnimation';
import PriceSummary from '../components/cart/PriceSummary';
import CouponBox from '../components/cart/CouponBox';

const STEPS = ['address', 'review', 'payment'];

export default function Checkout() {
  const { t } = useTranslation(['checkout', 'common']);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { items, coupon, totals } = useSelector((s) => s.cart);
  // Razorpay's modal shows this as the merchant name, so it follows the admin's.
  const { siteName } = useSettings();

  const [step, setStep] = useState('address');
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('razorpay');
  const [placing, setPlacing] = useState(false);
  // Order id whose confirmation animation is playing; we navigate once it finishes.
  const [confirmingId, setConfirmingId] = useState(null);

  const addresses = useFetch(useCallback(() => addressApi.list(), []), []);
  const paymentConfig = useFetch(useCallback(() => paymentApi.config(), []), []);

  const addressList = addresses.data?.data?.addresses || [];
  const razorpayEnabled = paymentConfig.data?.data?.enabled;

  useEffect(() => {
    dispatch(fetchCart());
  }, [dispatch]);

  /*
   * Everything the review step totals up can move under the shopper while they are
   * still filling in an address: a line can be repriced or sold out, and the coupon
   * they applied on the cart page can be withdrawn. The server re-checks all of it
   * when the order is placed, so the risk here is not a bad order — it is a shopper
   * who agreed to one figure and is charged another. Re-reading the cart keeps the
   * summary honest before they commit rather than after.
   */
  const affectsThisOrder = useCallback(
    (payload) => {
      const productId = String(payload?.productId || '');
      return Boolean(
        productId &&
          items.some((item) => String(item.product?._id || item.product || '') === productId)
      );
    },
    [items]
  );

  // Refreshed rather than left stale, but said out loud — a shopper who reads a total,
  // fills in an address and then pays a different figure has been misled either way.
  const refreshOrder = useCallback(
    (message) => () => {
      dispatch(fetchCart());
      toast(message, { icon: 'ℹ️' });
    },
    [dispatch]
  );

  useLiveRefetch(refreshOrder(t('checkout.cartChanged')), CATALOG_EVENTS, {
    filter: affectsThisOrder,
  });

  useLiveRefetch(refreshOrder(t('checkout.couponChanged')), EVENTS.COUPON_CHANGED, {
    enabled: Boolean(coupon?.code),
    filter: (payload) => !payload?.code || payload.code === coupon?.code,
  });

  // An admin switching the gateway off mid-checkout must not leave the shopper on a
  // payment option that will fail — the fallback effect below moves them to COD.
  useLiveRefetch(paymentConfig.refetch, EVENTS.SETTINGS_UPDATED);

  // Preselect the default address so most shoppers can skip step 1 entirely.
  useEffect(() => {
    if (!selectedAddressId && addressList.length) {
      setSelectedAddressId((addressList.find((a) => a.isDefault) || addressList[0])._id);
    }
  }, [addressList, selectedAddressId]);

  // A Razorpay outage shouldn't strand the shopper — fall back to COD.
  useEffect(() => {
    if (paymentConfig.data && !razorpayEnabled) setPaymentMethod('cod');
  }, [paymentConfig.data, razorpayEnabled]);

  const onAddressSaved = (address) => {
    addresses.refetch();
    setSelectedAddressId(address._id);
    setShowAddressForm(false);
    setEditingAddress(null);
  };

  const finishConfirmation = useCallback(() => {
    navigate(`/order-success/${confirmingId}`, { replace: true });
  }, [confirmingId, navigate]);

  const placeOrder = async () => {
    if (!selectedAddressId) return toast.error(t('checkout.selectAddress'));

    setPlacing(true);
    let createdOrder = null;

    try {
      const orderRes = await orderApi.create({
        addressId: selectedAddressId,
        couponCode: coupon?.code,
        paymentMethod,
      });
      createdOrder = orderRes.data.order;

      if (paymentMethod === 'cod') {
        setConfirmingId(createdOrder._id);
        dispatch(fetchCart());
        return;
      }

      const scriptReady = await loadRazorpayScript();
      if (!scriptReady) throw new Error(t('payment.gatewayLoadFailed'));

      const paymentRes = await paymentApi.createOrder(createdOrder._id);

      const result = await openRazorpayCheckout({
        keyId: paymentRes.data.keyId,
        order: paymentRes.data,
        prefill: paymentRes.data.prefill,
        name: siteName,
        description: t('payment.orderDescription', { number: createdOrder.orderNumber }),
      });

      if (result.status === 'dismissed') {
        toast(t('payment.cancelled'), { icon: 'ℹ️' });
        return navigate(`/account/orders/${createdOrder._id}`);
      }

      if (result.status === 'failed') {
        await paymentApi
          .recordFailure({
            orderId: createdOrder._id,
            razorpayOrderId: paymentRes.data.razorpayOrderId,
            code: result.error?.code,
            description: result.error?.description,
          })
          .catch(() => {});
        throw new Error(result.error?.description || t('payment.failed'));
      }

      await paymentApi.verify({ ...result.payload, orderId: createdOrder._id });
      setConfirmingId(createdOrder._id);
      dispatch(fetchCart());
    } catch (err) {
      toast.error(err.message || t('checkout.placeFailed'));
      // The order exists but is unpaid — send them somewhere they can retry.
      if (createdOrder) navigate(`/account/orders/${createdOrder._id}`);
    } finally {
      setPlacing(false);
    }
  };

  // The cart empties the moment the order lands, so the confirmation animation has to
  // outrank this guard — otherwise the empty-cart state flashes mid-checkout.
  if (!items.length && !confirmingId) {
    return (
      <div className="container-page py-10">
        <EmptyState
          icon="cart"
          title={t('cart.emptyTitle')}
          message={t('checkout.emptyCartMessage')}
          actionLabel={t('wishlist.browse')}
          actionTo="/products"
        />
      </div>
    );
  }

  const selectedAddress = addressList.find((a) => a._id === selectedAddressId);
  const stepIndex = STEPS.indexOf(step);

  return (
    <>
      <Seo title={t('checkout.title')} path="/checkout" noIndex />

      <div className="container-page py-5">
        <Breadcrumb
          items={[
            { label: t('common:nav.cart'), to: '/cart' },
            { label: t('checkout.title') },
          ]}
          className="mb-4"
        />

        {/* The step tracker is checkout navigation — it has no job once the order is placed. */}
        {!confirmingId && (
          <div className="mb-6 flex items-center gap-2 sm:gap-4">
            {STEPS.map((key, index) => (
              <div key={key} className="flex flex-1 items-center gap-2 sm:gap-3">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold transition ${
                    index <= stepIndex ? 'bg-brand-600 text-white' : 'bg-ink-200 text-ink-500'
                  }`}
                >
                  {index < stepIndex ? <Icon name="check" size={15} /> : index + 1}
                </span>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    index <= stepIndex ? 'text-ink-900' : 'text-ink-400'
                  }`}
                >
                  {t(`checkout.steps.${key}`)}
                </span>
                {index < STEPS.length - 1 && (
                  <span
                    className={`h-0.5 flex-1 rounded ${index < stepIndex ? 'bg-brand-600' : 'bg-ink-200'}`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {confirmingId ? (
          <OrderConfirmAnimation onDone={finishConfirmation} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              {/* ---------- Step 1: address ---------- */}
              <section className="card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-base font-bold text-ink-900">
                    <Icon name="location" size={18} className="text-brand-600" />
                    {t('checkout.steps.address')}
                  </h2>
                  {step !== 'address' && selectedAddress && (
                    <button
                      type="button"
                      onClick={() => setStep('address')}
                      className="text-sm font-semibold text-brand-600 hover:underline"
                    >
                      {t('checkout.change')}
                    </button>
                  )}
                </div>

                {step !== 'address' && selectedAddress ? (
                  <div className="rounded-lg bg-ink-50 p-4 text-sm">
                    <p className="font-semibold text-ink-900">
                      {selectedAddress.fullName} · {selectedAddress.phone}
                    </p>
                    <p className="mt-1 text-ink-600">
                      {selectedAddress.addressLine1}
                      {selectedAddress.addressLine2
                        ? `, ${selectedAddress.addressLine2}`
                        : ''}, {selectedAddress.city}, {selectedAddress.state} —{' '}
                      {selectedAddress.pincode}
                    </p>
                  </div>
                ) : (
                  <>
                    {addresses.loading ? (
                      <ListRowSkeleton rows={2} />
                    ) : (
                      <div className="space-y-3">
                        {addressList.map((address) => (
                          <label
                            key={address._id}
                            className={`flex cursor-pointer gap-3 rounded-lg border p-4 transition ${
                              selectedAddressId === address._id
                                ? 'border-brand-600 bg-brand-50'
                                : 'border-ink-200 hover:border-ink-300'
                            }`}
                          >
                            <input
                              type="radio"
                              name="address"
                              checked={selectedAddressId === address._id}
                              onChange={() => setSelectedAddressId(address._id)}
                              className="mt-1 h-4 w-4 shrink-0 border-ink-300 text-brand-600 focus:ring-brand-500"
                            />
                            <div className="min-w-0 flex-1 text-sm">
                              <div className="mb-1 flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-ink-900">
                                  {address.fullName}
                                </span>
                                <span className="badge bg-ink-100 text-ink-600 ring-ink-200">
                                  {t(`address.labels.${address.label}`, address.label)}
                                </span>
                                {address.isDefault && (
                                  <span className="badge bg-emerald-50 text-success ring-emerald-200">
                                    {t('address.default')}
                                  </span>
                                )}
                              </div>
                              <p className="text-ink-600">
                                {address.addressLine1}
                                {address.addressLine2 ? `, ${address.addressLine2}` : ''},{' '}
                                {address.city}, {address.state} — {address.pincode}
                              </p>
                              <p className="mt-1 text-ink-500">
                                {t('address.phoneLine', { phone: address.phone })}
                              </p>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setEditingAddress(address);
                                  setShowAddressForm(true);
                                }}
                                className="mt-2 text-xs font-semibold text-brand-600 hover:underline"
                              >
                                {t('common:actions.edit')}
                              </button>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}

                    {showAddressForm ? (
                      <div className="mt-4 rounded-lg border border-ink-200 p-4">
                        <h3 className="mb-4 text-sm font-bold text-ink-900">
                          {editingAddress ? 'Edit address' : 'Add a new address'}
                        </h3>
                        <AddressForm
                          address={editingAddress}
                          onSaved={onAddressSaved}
                          onCancel={() => {
                            setShowAddressForm(false);
                            setEditingAddress(null);
                          }}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAddress(null);
                          setShowAddressForm(true);
                        }}
                        className="btn-outline mt-4 w-full border-dashed"
                      >
                        <Icon name="plus" size={16} />
                        {t('address.addTitle')}
                      </button>
                    )}

                    {selectedAddressId && !showAddressForm && (
                      <button
                        type="button"
                        onClick={() => setStep('review')}
                        className="btn-primary mt-4 w-full sm:w-auto"
                      >
                        {t('checkout.deliverHere')}
                      </button>
                    )}
                  </>
                )}
              </section>

              {/* ---------- Step 2: review ---------- */}
              {stepIndex >= 1 && (
                <section className="card p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-ink-900">
                    <Icon name="package" size={18} className="text-brand-600" />
                    {t('checkout.summaryHeading', { count: items.length })}
                  </h2>

                  <div className="divide-y divide-ink-100">
                    {items.map((item) => (
                      <div key={item._id} className="flex gap-3 py-3">
                        <img
                          src={optimisedImage(item.image || primaryImageOf(item.product), {
                            width: 120,
                            height: 120,
                          })}
                          alt={item.product.name}
                          loading="lazy"
                          className="h-16 w-16 rounded-lg border border-ink-200 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/product/${item.product.slug}`}
                            className="line-clamp-2 text-sm font-medium text-ink-800 hover:text-brand-600"
                          >
                            {item.product.name}
                          </Link>
                          {/* The exact SKU being bought — the last chance to spot a wrong size. */}
                          {item.variant?.label && (
                            <p className="mt-0.5 text-xs font-medium text-ink-600">
                              {item.variant.label}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-ink-500">
                            {t('checkout.qty', { count: item.quantity })}
                          </p>
                        </div>
                        <p className="shrink-0 text-sm font-bold text-ink-900">
                          {formatPrice(item.lineTotal)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {step === 'review' && (
                    <button
                      type="button"
                      onClick={() => setStep('payment')}
                      className="btn-primary mt-4 w-full sm:w-auto"
                    >
                      {t('checkout.continueToPayment')}
                    </button>
                  )}
                </section>
              )}

              {/* ---------- Step 3: payment ---------- */}
              {step === 'payment' && (
                <section className="card p-5">
                  <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-ink-900">
                    <Icon name="creditCard" size={18} className="text-brand-600" />
                    {t('payment.methodTitle')}
                  </h2>

                  <div className="space-y-3">
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                        paymentMethod === 'razorpay'
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-ink-200 hover:border-ink-300'
                      } ${!razorpayEnabled ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="razorpay"
                        checked={paymentMethod === 'razorpay'}
                        disabled={!razorpayEnabled}
                        onChange={() => setPaymentMethod('razorpay')}
                        className="mt-1 h-4 w-4 border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <p className="text-sm font-semibold text-ink-900">
                          {t('payment.onlineTitle')}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {t(razorpayEnabled ? 'payment.onlineText' : 'payment.onlineUnavailable')}
                        </p>
                      </div>
                    </label>

                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition ${
                        paymentMethod === 'cod'
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-ink-200 hover:border-ink-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="cod"
                        checked={paymentMethod === 'cod'}
                        onChange={() => setPaymentMethod('cod')}
                        className="mt-1 h-4 w-4 border-ink-300 text-brand-600 focus:ring-brand-500"
                      />
                      <div>
                        <p className="text-sm font-semibold text-ink-900">{t('payment.codTitle')}</p>
                        <p className="mt-0.5 text-xs text-ink-500">{t('payment.codText')}</p>
                      </div>
                    </label>
                  </div>
                </section>
              )}
            </div>

            <div className="space-y-4 lg:sticky lg:top-[160px] lg:self-start">
              {/* The same control the cart shows, in the same place in the column:
                  a shopper who reaches payment and remembers a code should not have
                  to walk back to /cart to use it. The applied coupon travels here
                  in the cart itself, so arriving with one already on needs nothing. */}
              <CouponBox coupon={coupon} appliedDiscount={totals.couponDiscount} />

              <PriceSummary
                totals={totals}
                couponCode={coupon?.code}
                title={t('checkout.orderTotal')}
              >
                {step === 'payment' ? (
                  <button
                    type="button"
                    onClick={placeOrder}
                    disabled={placing || !selectedAddressId}
                    className="btn-accent w-full !py-3.5 !text-base"
                  >
                    {placing && <Spinner size={16} />}
                    {placing
                      ? t('checkout.processing')
                      : paymentMethod === 'cod'
                        ? t('checkout.placeOrder')
                        : t('checkout.payAmount', { amount: formatPrice(totals.total) })}
                  </button>
                ) : (
                  <p className="text-center text-xs text-ink-500">
                    {t('checkout.completeSteps')}
                  </p>
                )}

                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink-500">
                  <Icon name="shield" size={13} className="text-success" />
                  {t('checkout.encrypted')}
                </p>
              </PriceSummary>

              {/* <Trans> so each language can order "terms" and "privacy" naturally
                  instead of being forced into English's "… our X and Y." shape. */}
              <p className="mt-3 px-2 text-center text-[11px] leading-relaxed text-ink-400">
                <Trans
                  i18nKey="checkout:checkout.legal"
                  components={[
                    <span key="0" />,
                    <Link key="1" to="/terms" className="underline hover:text-brand-600" />,
                    <Link key="2" to="/privacy" className="underline hover:text-brand-600" />,
                  ]}
                />
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
