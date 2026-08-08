import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';

/**
 * @param {{items: Array<{label: string, to?: string}>}} props
 * The final item is rendered as plain text — it is the current page.
 */
export default function Breadcrumb({ items = [], className = '' }) {
  const { t } = useTranslation();

  if (!items.length) return null;

  return (
    <nav aria-label={t('a11y.breadcrumb')} className={`text-sm ${className}`}>
      <ol className="flex flex-wrap items-center gap-1 text-ink-500">
        <li>
          <Link to="/" className="hover:text-brand-600">
            {t('nav.home')}
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              <Icon name="chevronRight" size={14} className="text-ink-300" />
              {isLast || !item.to ? (
                <span className="max-w-[240px] truncate font-medium text-ink-800" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className="hover:text-brand-600">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
