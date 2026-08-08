import { useCallback, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { orderApi } from '../../api/endpoints';
import { getAccessToken } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useLiveRefetch, useRealtimeRoom } from '../../realtime/useRealtime';
import { ORDER_EVENTS, rooms } from '../../realtime/events';
import { formatDate, formatDateTime, formatPrice, optimisedImage } from '../../utils/format';
import { ORDER_STATUS_STEPS } from '../../utils/constants';
import { orderTotals } from '../../utils/pricing';
import PriceSummary from '../../components/cart/PriceSummary';
import Icon from '../../components/common/Icon';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import ErrorState from '../../components/common/ErrorState';
import { ListRowSkeleton } from '../../components/common/Skeleton';

function StatusTimeline({ order, t }) {
  if (order.orderStatus === 'cancelled') {
    return (
      <div className="flex items-start gap-3 rounded-lg bg-red-50 p-4">
        <Icon name="close" size={18} className="mt-0.5 shrink-0 text-danger" />
        <div className="text-sm">
          <p className="font-semibold text-red-800">{t('detail.cancelledTitle')}</p>
          <p className="text-red-700">
            {/* An admin-authored reason is shown as written; only our own default
                sentence is translated. */}
            {order.cancellationReason || t('detail.cancelledDefault')}
            {order.cancelledAt && ` · ${formatDate(order.cancelledAt)}`}
          </p>
        </div>
      </div>
    );
  }

  const currentIndex = ORDER_STATUS_STEPS.indexOf(order.orderStatus);
  // A history entry gives us the real timestamp for each completed stage.
  const historyFor = (key) => order.statusHistory?.find((h) => h.status === key);

  return (
    <ol className="relative">
      {ORDER_STATUS_STEPS.map((stepKey, index) => {
        const done = index <= currentIndex;
        const active = index === currentIndex;
        const entry = historyFor(stepKey);

        return (
          <li key={stepKey} className="relative flex gap-4 pb-6 last:pb-0">
            {index < ORDER_STATUS_STEPS.length - 1 && (
              <span
                className={`absolute left-[13px] top-7 h-full w-0.5 ${
                  index < currentIndex ? 'bg-success' : 'bg-ink-200'
                }`}
              />
            )}

            <span
              className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-white ${
                done ? 'bg-success text-white' : 'bg-ink-200 text-ink-400'
              } ${active ? 'animate-pulse' : ''}`}
            >
              {done ? <Icon name="check" size={13} /> : <span className="h-2 w-2 rounded-full bg-current" />}
            </span>

            <div className="pt-0.5">
              <p className={`text-sm font-semibold ${done ? 'text-ink-900' : 'text-ink-400'}`}>
                {t(`detail.steps.${stepKey}`)}
              </p>
              {entry && (
                <p className="text-xs text-ink-500">{formatDateTime(entry.changedAt)}</p>
              )}
              {entry?.note && <p className="mt-0.5 text-xs text-ink-500">{entry.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetail() {
  const { t } = useTranslation(['account', 'common']);
  const { id } = useParams();
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data, loading, error, refetch } = useFetch(
    useCallback(() => orderApi.detail(id), [id]),
    [id]
  );

  // The timeline and tracking details are exactly what an admin changes, so this
  // page follows its own order rather than polling.
  useRealtimeRoom(rooms.order(id));
  useLiveRefetch(refetch, ORDER_EVENTS, {
    filter: (payload) => !payload?.order?._id || payload.order._id === id,
  });

  const order = data?.data?.order;

  const cancel = async () => {
    try {
      // Stored on the order and read by staff, so it stays in the store's language.
      await orderApi.cancel(id, 'Cancelled by customer');
      toast.success(t('detail.cancelled'));
      refetch();
    } catch (err) {
      toast.error(err.message || t('detail.cancelFailed'));
    }
  };

  const downloadInvoice = async () => {
    try {
      const response = await fetch(orderApi.invoiceUrl(id), {
        headers: { Authorization: `Bearer ${getAccessToken()}` },
        credentials: 'include',
      });
      if (!response.ok) throw new Error(t('detail.invoiceUnavailable'));

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${order.invoiceNumber}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <ListRowSkeleton rows={3} />;
  if (error || !order) {
    return <ErrorState title={t('detail.notFound')} message={error?.message} onRetry={refetch} />;
  }

  const canCancel = ['pending', 'confirmed', 'packed', 'shipped'].includes(order.orderStatus);
  const invoiceAvailable = order.paymentStatus === 'paid' || order.paymentMethod === 'cod';

  return (
    <div className="space-y-5">
      <Link
        to="/account/orders"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline"
      >
        <Icon name="chevronLeft" size={15} />
        {t('detail.backToOrders')}
      </Link>

      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-ink-900">{order.orderNumber}</h1>
            <p className="mt-0.5 text-sm text-ink-500">
              {t('detail.placedOn', { date: formatDateTime(order.createdAt) })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={order.paymentStatus} kind="payment" />
            <StatusBadge status={order.orderStatus} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3 border-t border-ink-100 pt-4">
          {invoiceAvailable && (
            <button type="button" onClick={downloadInvoice} className="btn-outline">
              <Icon name="download" size={16} />
              {t('detail.downloadInvoice')}
            </button>
          )}
          {canCancel && (
            <button type="button" onClick={() => setCancelOpen(true)} className="btn-outline !text-danger">
              {t('detail.cancelOrder')}
            </button>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-4 text-base font-bold text-ink-900">{t('detail.orderStatus')}</h2>
            <StatusTimeline order={order} t={t} />

            {(order.trackingNumber || order.expectedDeliveryDate) && (
              <div className="mt-4 grid gap-3 rounded-lg bg-ink-50 p-4 text-sm sm:grid-cols-2">
                {order.trackingNumber && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                      {t('detail.trackingLabel')}
                    </p>
                    <p className="font-semibold text-ink-800">
                      {order.trackingNumber}
                      {order.courierPartner && ` · ${order.courierPartner}`}
                    </p>
                  </div>
                )}
                {order.expectedDeliveryDate && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                      {t('detail.expectedDelivery')}
                    </p>
                    <p className="font-semibold text-ink-800">
                      {formatDate(order.expectedDeliveryDate)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-base font-bold text-ink-900">
              {t('detail.itemsHeading', { count: order.items.length })}
            </h2>
            <div className="divide-y divide-ink-100">
              {order.items.map((item, index) => (
                <div key={index} className="flex gap-3 py-3">
                  {item.image && (
                    <Link to={item.slug ? `/product/${item.slug}` : '#'} className="shrink-0">
                      <img
                        src={optimisedImage(item.image, { width: 140, height: 140 })}
                        alt={item.name}
                        loading="lazy"
                        className="h-[70px] w-[70px] rounded-lg border border-ink-200 object-cover"
                      />
                    </Link>
                  )}
                  <div className="min-w-0 flex-1">
                    <Link
                      to={item.slug ? `/product/${item.slug}` : '#'}
                      className="line-clamp-2 text-sm font-medium text-ink-800 hover:text-brand-600"
                    >
                      {item.name}
                    </Link>
                    {/* The SKU that shipped — what a return or a support query refers to. */}
                    {item.variantLabel && (
                      <p className="mt-0.5 text-xs font-medium text-ink-700">
                        {item.variantLabel}
                        {item.variantSku && (
                          <span className="ml-2 font-normal text-ink-400">{item.variantSku}</span>
                        )}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-ink-500">
                      {[item.brand, item.categoryName, item.subCategoryName].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-1 text-xs text-ink-500">
                      {formatPrice(item.finalPrice)} × {item.quantity}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-ink-900">
                    {formatPrice(item.lineTotal)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
              {t('detail.deliveryAddress')}
            </h2>
            <p className="text-sm font-semibold text-ink-900">{order.shippingAddress.fullName}</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-600">
              {order.shippingAddress.addressLine1}
              {order.shippingAddress.addressLine2 && `, ${order.shippingAddress.addressLine2}`}
              {order.shippingAddress.landmark && `, ${order.shippingAddress.landmark}`}
              <br />
              {order.shippingAddress.city}, {order.shippingAddress.state} —{' '}
              {order.shippingAddress.pincode}
              <br />
              {order.shippingAddress.country}
            </p>
            <p className="mt-2 text-sm text-ink-500">
              {t('detail.phone', { phone: order.shippingAddress.phone })}
            </p>
          </section>

          {/* The cart's own Price Details card, fed the order's stored pricing —
              same rows, same arithmetic, same wording as at checkout. */}
          <PriceSummary
            totals={orderTotals(order)}
            couponCode={order.pricing.couponCode}
            title={t('detail.priceDetails')}
          >
            <p className="text-xs text-ink-500">
              {t('detail.paidVia', {
                method:
                  order.paymentMethod === 'cod'
                    ? t('detail.cashOnDelivery')
                    : t('detail.onlineRazorpay'),
              })}{' '}
              · {t(`common:paymentStatus.${order.paymentStatus}`, order.paymentStatus)}
            </p>
          </PriceSummary>
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={cancel}
        title={t('detail.cancelTitle')}
        message={t('detail.cancelMessage')}
        confirmLabel={t('detail.cancelConfirm')}
        cancelLabel={t('detail.cancelDismiss')}
      />
    </div>
  );
}
