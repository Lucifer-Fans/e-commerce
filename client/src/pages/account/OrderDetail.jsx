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
import {
  CUSTOMER_CANCELLABLE_STATUSES,
  ORDER_CLOSED_STATUSES,
  ORDER_STATUS_STEPS,
} from '../../utils/constants';
import { orderTotals } from '../../utils/pricing';
import PriceSummary from '../../components/cart/PriceSummary';
import Icon from '../../components/common/Icon';
import StatusBadge from '../../components/common/StatusBadge';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Modal from '../../components/common/Modal';
import CancelReasonDialog from '../../components/orders/CancelReasonDialog';
import ErrorState from '../../components/common/ErrorState';
import { ListRowSkeleton } from '../../components/common/Skeleton';

/**
 * The rows the timeline draws for one order.
 *
 * A closed order is read from its own history rather than from where `cancelled`
 * sits in the ladder: it stopped somewhere along the path, and the question is
 * what actually happened, not how the terminal status sorts. So the steps it
 * really reached stay, complete and green, and the closing status is appended as
 * the last row — the steps it never got to are simply not drawn, because a grey
 * "Delivered" under a cancelled order invites exactly the question it can't
 * answer.
 *
 * A live order keeps the full ladder ahead of it, greyed, so a shopper can see
 * what is still to come.
 */
function timelineRows(order) {
  const history = order.statusHistory || [];
  const rankOf = (status) => ORDER_STATUS_STEPS.indexOf(status);
  const entryFor = (status) => history.find((row) => row.status === status);

  const closed = ORDER_CLOSED_STATUSES.includes(order.orderStatus);
  const reachedFromHistory = history.reduce((max, row) => Math.max(max, rankOf(row.status)), -1);
  // "Order Placed" is true of every order, whether or not a `pending` row was
  // ever written — a COD order is confirmed the moment it is created.
  const reached = closed
    ? Math.max(reachedFromHistory, 0)
    : Math.max(reachedFromHistory, rankOf(order.orderStatus), 0);

  const steps = ORDER_STATUS_STEPS.slice(0, closed ? reached + 1 : undefined).map((key, index) => {
    const entry = entryFor(key);

    return {
      key,
      label: `detail.steps.${key}`,
      done: index <= reached,
      // Nothing is still in progress once an order has stopped.
      active: !closed && index === reached,
      at: entry?.changedAt || (index === 0 ? order.createdAt : null),
      note: entry?.note,
    };
  });

  if (!closed) return steps;

  return [
    ...steps,
    {
      key: order.orderStatus,
      // The terminal statuses are already named in the shared status vocabulary;
      // `detail.steps` only covers the fulfilment path.
      label: `common:orderStatus.${order.orderStatus}`,
      done: true,
      closing: true,
      at: order.cancelledAt || entryFor(order.orderStatus)?.changedAt,
      reason: order.cancellationReason,
      by: order.cancelledBy,
    },
  ];
}

function StatusTimeline({ order, t }) {
  const rows = timelineRows(order);

  return (
    <ol className="relative">
      {rows.map((row, index) => {
        const last = index === rows.length - 1;
        const closing = Boolean(row.closing);

        return (
          <li key={row.key} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                className={`absolute left-[13px] top-7 h-full w-0.5 ${
                  // The segment takes the colour of the step it runs *into*, so the
                  // line arriving at a cancellation is red.
                  rows[index + 1].closing
                    ? 'bg-danger'
                    : rows[index + 1].done
                    ? 'bg-success'
                    : 'bg-ink-200'
                }`}
              />
            )}

            <span
              className={`relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full ring-4 ring-white ${
                closing
                  ? 'bg-danger text-white'
                  : row.done
                  ? 'bg-success text-white'
                  : 'bg-ink-200 text-ink-400'
              } ${row.active ? 'animate-pulse' : ''}`}
            >
              {closing ? (
                <Icon name="close" size={13} />
              ) : row.done ? (
                <Icon name="check" size={13} />
              ) : (
                <span className="h-2 w-2 rounded-full bg-current" />
              )}
            </span>

            <div className="min-w-0 pt-0.5">
              <p
                className={`text-sm font-semibold ${
                  closing ? 'text-red-800' : row.done ? 'text-ink-900' : 'text-ink-400'
                }`}
              >
                {t(row.label)}
              </p>
              {row.at && (
                <p className={`text-xs ${closing ? 'text-red-700' : 'text-ink-500'}`}>
                  {formatDateTime(row.at)}
                </p>
              )}

              {closing ? (
                <div className="mt-2 rounded-lg bg-red-50 p-3 text-xs">
                  <p className="font-semibold text-red-800">
                    {row.by === 'customer'
                      ? t('detail.cancelledByYou')
                      : row.by === 'admin'
                      ? t('detail.cancelledByStore')
                      : t('detail.cancelledTitle')}
                  </p>
                  {/* An admin-authored reason, or the shopper's own words, shown as
                      written; only our fallback sentence is translated. */}
                  <p className="mt-0.5 text-red-700">
                    {t('detail.cancelledReason', {
                      reason: row.reason || t('detail.cancelledDefault'),
                    })}
                  </p>
                </div>
              ) : (
                row.note && <p className="mt-0.5 text-xs text-ink-500">{row.note}</p>
              )}
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
  /**
   * The cancel journey is three dialogs deep, and only one is ever open:
   * `confirm` (are you sure) → `reason` (why), or `blocked` for an order that has
   * already shipped — the button stays on the page in that case and explains
   * itself rather than disappearing, which reads as the feature being broken.
   */
  const [dialog, setDialog] = useState(null);

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

  /**
   * Runs once a reason has been chosen — the confirmation dialog on its own no
   * longer cancels anything. The error is rethrown so the reason dialog can show
   * it inline and stay open on the choice the shopper already made.
   */
  const cancel = async (payload) => {
    try {
      await orderApi.cancel(id, payload);
      // No toast here — the realtime order-status broadcast already announces the
      // cancellation, and firing both stacked two near-identical toasts.
      refetch();
    } catch (err) {
      toast.error(err.message || t('detail.cancelFailed'));
      throw err;
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

  const canCancel = CUSTOMER_CANCELLABLE_STATUSES.includes(order.orderStatus);
  // Offered right up to delivery; past `packed` it explains why it can't be used.
  // An order that has already closed has nothing left to cancel.
  const showCancel = !ORDER_CLOSED_STATUSES.includes(order.orderStatus);
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
          {showCancel && (
            <button
              type="button"
              onClick={() => setDialog(canCancel ? 'confirm' : 'blocked')}
              className="btn-outline !text-danger"
            >
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

      {/* Step one: are you sure. Confirming only opens the reason dialog — the
          order is not touched until a reason has been given. */}
      <ConfirmDialog
        open={dialog === 'confirm'}
        // ConfirmDialog closes itself after `onConfirm` resolves, which would undo
        // the step it just opened — so dismissing only applies while this dialog
        // is still the one on screen.
        onClose={() => setDialog((open) => (open === 'confirm' ? null : open))}
        onConfirm={() => setDialog('reason')}
        title={t('detail.cancelTitle')}
        message={t('detail.cancelMessage')}
        confirmLabel={t('detail.cancelConfirm')}
        cancelLabel={t('detail.cancelDismiss')}
      />

      <CancelReasonDialog
        open={dialog === 'reason'}
        onClose={() => setDialog(null)}
        onConfirm={cancel}
      />

      {/* Past the cut-off the same button opens this instead — it says what
          happened and where to go, rather than failing silently. */}
      <Modal
        open={dialog === 'blocked'}
        onClose={() => setDialog(null)}
        title={t('detail.cancelBlockedTitle')}
        size="sm"
        footer={
          <button type="button" onClick={() => setDialog(null)} className="btn-primary">
            {t('common:actions.close')}
          </button>
        }
      >
        <div className="flex items-start gap-3">
          <Icon name="info" size={18} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-sm text-ink-600">
            {t('detail.cancelBlockedMessage', {
              status: t(`common:orderStatus.${order.orderStatus}`),
            })}
          </p>
        </div>
      </Modal>
    </div>
  );
}
