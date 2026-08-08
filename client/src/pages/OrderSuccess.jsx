import { useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { orderApi } from '../api/endpoints';
import useFetch from '../hooks/useFetch';
import { formatPrice, formatDate, optimisedImage } from '../utils/format';
import { getAccessToken } from '../api/client';
import Seo from '../components/common/Seo';
import Icon from '../components/common/Icon';
import Spinner from '../components/common/Spinner';
import ErrorState from '../components/common/ErrorState';

export default function OrderSuccess() {
  const { t } = useTranslation(['checkout', 'common']);
  const { id } = useParams();
  const { data, loading, error, refetch } = useFetch(
    useCallback(() => orderApi.detail(id), [id]),
    [id]
  );

  const order = data?.data?.order;

  /**
   * The invoice route needs the bearer token, so it can't be a plain <a href>.
   * Fetch it as a blob and hand the browser an object URL.
   */
  const downloadInvoice = async () => {
    const response = await fetch(orderApi.invoiceUrl(id), {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      credentials: 'include',
    });
    if (!response.ok) return;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${order.invoiceNumber}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Spinner size={34} className="text-brand-600" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container-page py-12">
        <ErrorState title={t('success.notFound')} message={error?.message} onRetry={refetch} />
      </div>
    );
  }

  const isPaid = order.paymentStatus === 'paid';

  return (
    <>
      <Seo title={t('success.seoTitle')} path={`/order-success/${id}`} noIndex />

      <div className="container-page max-w-3xl py-10">
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-10 text-center text-white">
            <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white/20 ring-4 ring-white/25">
              <Icon name="check" size={34} />
            </span>
            <h1 className="text-2xl font-extrabold">{t('success.title')}</h1>
            <p className="mt-1.5 text-sm text-emerald-50">{t('success.subtitle')}</p>
          </div>

          <div className="grid gap-px bg-ink-100 sm:grid-cols-3">
            {[
              { key: 'orderNumber', value: order.orderNumber },
              { key: 'orderDate', value: formatDate(order.createdAt) },
              { key: 'totalPaid', value: formatPrice(order.pricing.total, { precise: true }) },
            ].map((cell) => (
              <div key={cell.key} className="bg-white px-5 py-4 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {t(`success.${cell.key}`)}
                </p>
                <p className="mt-1 text-sm font-bold text-ink-900">{cell.value}</p>
              </div>
            ))}
          </div>

          <div className="p-6">
            <div
              className={`mb-5 flex items-start gap-3 rounded-lg p-4 ${
                isPaid ? 'bg-emerald-50' : 'bg-amber-50'
              }`}
            >
              <Icon
                name={isPaid ? 'check' : 'info'}
                size={18}
                className={`mt-0.5 shrink-0 ${isPaid ? 'text-success' : 'text-amber-600'}`}
              />
              <div className="text-sm">
                <p className={`font-semibold ${isPaid ? 'text-emerald-800' : 'text-amber-800'}`}>
                  {t(isPaid ? 'success.paidTitle' : 'payment.codTitle')}
                </p>
                <p className={isPaid ? 'text-emerald-700' : 'text-amber-700'}>
                  {isPaid
                    ? t('success.paidText')
                    : t('success.codText', { amount: formatPrice(order.pricing.total) })}
                </p>
              </div>
            </div>

            <h2 className="mb-3 text-sm font-bold text-ink-900">{t('success.items')}</h2>
            <div className="divide-y divide-ink-100">
              {order.items.map((item, index) => (
                <div key={index} className="flex gap-3 py-3">
                  {item.image && (
                    <img
                      src={optimisedImage(item.image, { width: 120, height: 120 })}
                      alt={item.name}
                      loading="lazy"
                      className="h-16 w-16 rounded-lg border border-ink-200 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium text-ink-800">{item.name}</p>
                    {item.variantLabel && (
                      <p className="mt-0.5 text-xs font-medium text-ink-600">{item.variantLabel}</p>
                    )}
                    <p className="mt-0.5 text-xs text-ink-500">
                      {t('checkout.qty', { count: item.quantity })} ×{' '}
                      {formatPrice(item.finalPrice)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold text-ink-900">
                    {formatPrice(item.lineTotal)}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-lg bg-ink-50 p-4 text-sm">
              <p className="mb-1 font-semibold text-ink-900">{t('success.deliveringTo')}</p>
              <p className="text-ink-600">
                {order.shippingAddress.fullName}, {order.shippingAddress.addressLine1},{' '}
                {order.shippingAddress.city}, {order.shippingAddress.state} —{' '}
                {order.shippingAddress.pincode}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to={`/account/orders/${order._id}`} className="btn-primary flex-1">
                {t('success.trackOrder')}
              </Link>
              <button type="button" onClick={downloadInvoice} className="btn-outline flex-1">
                <Icon name="download" size={16} />
                {t('success.downloadInvoice')}
              </button>
              <Link to="/products" className="btn-ghost flex-1">
                {t('cart.continueShopping')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
