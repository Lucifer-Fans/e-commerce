import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import StatusBadge from '../common/StatusBadge';

/**
 * Why the account cannot be closed yet.
 *
 * Deactivation signs every device out and shuts the account to sign-in, so a
 * shopper who does it with a parcel on its way loses the ability to track it, to
 * cancel it, or to read a word we send about it — while we still owe them the
 * goods. The rule exists for that, and this dialog is where it is explained.
 *
 * It lists the orders rather than only stating the rule. "You have pending
 * orders" leaves someone hunting through their history for which ones; the list
 * turns the refusal into a short, finishable task, and every row links straight
 * to the page where it can be tracked or cancelled.
 */
export default function PendingOrdersDialog({ open, onClose, orders = [] }) {
  const { t } = useTranslation(['account', 'common']);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.pendingOrdersTitle')}
      sheet
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline">
            {t('common:actions.close')}
          </button>
          <Link to="/account/orders" className="btn-primary">
            {t('settings.pendingOrdersAction')}
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          <p>{t('settings.pendingOrdersMessage')}</p>
        </div>

        {orders.length > 0 && (
          <ul className="divide-y divide-ink-100 rounded-lg border border-ink-200">
            {orders.map((order) => (
              <li key={order._id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <Link
                  to={`/account/orders/${order._id}`}
                  onClick={onClose}
                  className="min-w-0 text-sm font-semibold text-brand-600 hover:underline"
                >
                  {order.orderNumber}
                </Link>
                <StatusBadge status={order.orderStatus} />
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-ink-500">{t('settings.pendingOrdersHint')}</p>
      </div>
    </Modal>
  );
}
