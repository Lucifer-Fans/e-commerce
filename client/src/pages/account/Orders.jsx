import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orderApi } from '../../api/endpoints';
import useFetch from '../../hooks/useFetch';
import { useLiveRefetch } from '../../realtime/useRealtime';
import { ORDER_EVENTS } from '../../realtime/events';
import { formatDate, formatPrice, optimisedImage } from '../../utils/format';
import Icon from '../../components/common/Icon';
import StatusBadge from '../../components/common/StatusBadge';
import Pagination from '../../components/common/Pagination';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import { ListRowSkeleton } from '../../components/common/Skeleton';

/* Values are the API's; the labels come from the shared `orderStatus` map. */
const FILTERS = ['all', 'pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'];

export default function Orders() {
  const { t } = useTranslation(['account', 'common']);
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const { data, loading, error, refetch } = useFetch(
    useCallback(() => orderApi.list({ status, page, limit: 8 }), [status, page]),
    [status, page]
  );

  // Status moves, payments clearing and new orders all reshape this list.
  useLiveRefetch(refetch, ORDER_EVENTS);

  const orders = data?.data?.orders || [];
  const meta = data?.meta;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-ink-900">{t('common:nav.myOrders')}</h1>

      <div className="hide-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setStatus(value);
              setPage(1);
            }}
            aria-pressed={status === value}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
              status === value
                ? 'bg-brand-600 text-white'
                : 'border border-ink-300 bg-white text-ink-600 hover:border-brand-500 hover:text-brand-600'
            }`}
          >
            {value === 'all' ? t('orders.filterAll') : t(`common:orderStatus.${value}`)}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : loading ? (
        <ListRowSkeleton rows={4} />
      ) : !orders.length ? (
        <EmptyState
          icon="package"
          title={
            status === 'all'
              ? t('orders.emptyTitle')
              : t('orders.emptyFiltered', { status: t(`common:orderStatus.${status}`) })
          }
          message={t(status === 'all' ? 'orders.emptyMessage' : 'orders.emptyFilteredMessage')}
          actionLabel={t(status === 'all' ? 'orders.startShopping' : 'orders.showAll')}
          actionTo={status === 'all' ? '/products' : undefined}
          onAction={status === 'all' ? undefined : () => setStatus('all')}
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order._id} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-100 bg-ink-50 px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
                  <div>
                    <p className="font-medium uppercase tracking-wide text-ink-400">
                      {t('orders.order')}
                    </p>
                    <p className="font-bold text-ink-900">{order.orderNumber}</p>
                  </div>
                  <div>
                    <p className="font-medium uppercase tracking-wide text-ink-400">
                      {t('orders.placedOn')}
                    </p>
                    <p className="font-semibold text-ink-700">{formatDate(order.createdAt)}</p>
                  </div>
                  <div>
                    <p className="font-medium uppercase tracking-wide text-ink-400">
                      {t('orders.total')}
                    </p>
                    <p className="font-bold text-ink-900">{formatPrice(order.pricing.total)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge status={order.paymentStatus} kind="payment" />
                  <StatusBadge status={order.orderStatus} />
                </div>
              </div>

              <div className="p-4">
                <div className="mb-3 flex flex-wrap gap-3">
                  {order.items.slice(0, 4).map((item, index) => (
                    <div key={index} className="flex items-center gap-2.5">
                      {item.image && (
                        <img
                          src={optimisedImage(item.image, { width: 100, height: 100 })}
                          alt={item.name}
                          loading="lazy"
                          className="h-14 w-14 rounded-lg border border-ink-200 object-cover"
                        />
                      )}
                      <div className="max-w-[180px]">
                        <p className="line-clamp-2 text-xs font-medium text-ink-700">{item.name}</p>
                        <p className="text-[11px] text-ink-400">
                          {t('orders.qty', { count: item.quantity })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {order.items.length > 4 && (
                    <span className="self-center text-xs font-medium text-ink-500">
                      {t('orders.moreItems', { count: order.items.length - 4 })}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
                  {order.orderStatus === 'delivered' && order.deliveredAt ? (
                    <p className="text-xs font-medium text-success">
                      {t('orders.deliveredOn', { date: formatDate(order.deliveredAt) })}
                    </p>
                  ) : order.orderStatus === 'cancelled' ? (
                    <p className="text-xs font-medium text-danger">
                      {order.cancelledAt
                        ? t('orders.cancelledOn', { date: formatDate(order.cancelledAt) })
                        : t('common:orderStatus.cancelled')}
                    </p>
                  ) : (
                    <p className="text-xs text-ink-500">
                      {order.trackingNumber
                        ? t('orders.tracking', { number: order.trackingNumber })
                        : t('orders.willNotify')}
                    </p>
                  )}

                  <Link
                    to={`/account/orders/${order._id}`}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline"
                  >
                    {t('orders.viewDetails')}
                    <Icon name="chevronRight" size={15} />
                  </Link>
                </div>
              </div>
            </article>
          ))}

          {meta?.totalPages > 1 && (
            <Pagination page={page} totalPages={meta.totalPages} onChange={setPage} className="pt-2" />
          )}
        </div>
      )}
    </div>
  );
}
