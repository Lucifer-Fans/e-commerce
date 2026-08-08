import { useTranslation } from 'react-i18next';
import { formatPrice } from '../../utils/format';
import Icon from '../common/Icon';

/**
 * Shared price breakdown — the cart, the checkout column and a placed order's
 * Price Details card are all this component, so the four figures a shopper
 * approves never change shape between the pages that show them.
 *
 * The column adds up and only the column adds up:
 *
 *     subtotal − coupon + delivery = total
 *
 * `subtotal` is billed from the discounted selling price, so the product
 * discount is already inside it. It is *not* a row — a card that opens on the
 * MRP and then deducts it invites the reader to subtract a saving that was
 * banked before checkout. The MRP is struck through beside the subtotal and the
 * saving is named once, under the total, where it can't be mistaken for a
 * deduction still to come.
 */
export default function PriceSummary({ totals, couponCode, children, title }) {
  const { t } = useTranslation('checkout');

  const rows = [
    {
      id: 'subtotal',
      label: t('summary.subtotal', { count: totals.itemCount }),
      value: formatPrice(totals.subtotal, { precise: true }),
      // Display only: what these items list at before their own discount.
      was: totals.discount > 0 ? formatPrice(totals.mrpTotal, { precise: true }) : null,
    },
    totals.couponDiscount > 0 && {
      id: 'coupon',
      label: t('summary.coupon', { code: couponCode }),
      value: `− ${formatPrice(totals.couponDiscount, { precise: true })}`,
      positive: true,
    },
    {
      id: 'shipping',
      label: t('summary.delivery'),
      value: totals.shipping > 0 ? formatPrice(totals.shipping, { precise: true }) : t('summary.free'),
      positive: totals.shipping === 0,
    },
  ].filter(Boolean);

  return (
    <div className="card p-5">
      <h2 className="mb-4 border-b border-ink-100 pb-3 text-sm font-bold uppercase tracking-wide text-ink-500">
        {title || t('summary.title')}
      </h2>

      <dl className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.id} className="flex justify-between gap-3 text-sm">
            <dt className="text-ink-600">{row.label}</dt>
            <dd className={`font-medium ${row.positive ? 'text-success' : 'text-ink-800'}`}>
              {row.was && <s className="mr-1.5 font-normal text-ink-400">{row.was}</s>}
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex justify-between border-t border-dashed border-ink-200 pt-4">
        <span className="text-base font-bold text-ink-900">{t('summary.total')}</span>
        <span className="text-base font-bold text-ink-900">
          {formatPrice(totals.total, { precise: true })}
        </span>
      </div>

      {totals.savings > 0 && (
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-success">
          <Icon name="tag" size={15} />
          {t('summary.savings', { amount: formatPrice(totals.savings, { precise: true }) })}
        </p>
      )}

      {totals.shipping > 0 && totals.amountForFreeShipping > 0 && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
          <Icon name="truck" size={14} />
          {t('summary.freeShippingNudge', {
            amount: formatPrice(totals.amountForFreeShipping),
          })}
        </p>
      )}

      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
