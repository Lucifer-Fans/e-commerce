import { useTranslation } from 'react-i18next';
import { ORDER_STATUS_STYLES, PAYMENT_STATUS_STYLES } from '../../utils/constants';
import { titleCase } from '../../utils/format';

export default function StatusBadge({ status, kind = 'order', className = '' }) {
  const { t } = useTranslation();
  const palette = kind === 'payment' ? PAYMENT_STATUS_STYLES : ORDER_STATUS_STYLES;
  const style = palette[status] || 'bg-ink-100 text-ink-700 ring-ink-200';

  // A status the API adds later still renders readably rather than as a raw key.
  const label = t(`${kind === 'payment' ? 'paymentStatus' : 'orderStatus'}.${status}`, {
    defaultValue: titleCase(status),
  });

  return <span className={`badge ${style} ${className}`}>{label}</span>;
}
