import { Link, useLocation } from 'react-router-dom';

import Icon from '../common/Icon';

/**
 * Cross-links between the informational pages. A shopper who lands on Returns
 * from a search result almost always needs Refunds or Shipping next, and the
 * footer is a long way down on a policy page.
 *
 * The page you are on drops out of its own list.
 */
const PAGES = [
  { to: '/about', key: 'about', icon: 'info' },
  { to: '/shipping-policy', key: 'shipping', icon: 'truck' },
  { to: '/returns', key: 'returns', icon: 'refresh' },
  { to: '/refund-policy', key: 'refund', icon: 'creditCard' },
  { to: '/faq', key: 'faq', icon: 'search' },
  { to: '/terms', key: 'terms', icon: 'file' },
  { to: '/privacy', key: 'privacy', icon: 'lock' },
  { to: '/contact', key: 'contact', icon: 'mail' },
];

export default function RelatedPolicies({ t }) {
  const { pathname } = useLocation();
  const pages = PAGES.filter((page) => page.to !== pathname);

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-ink-900">
        {t('ui.relatedTitle')}
        <span className="mt-2 block h-0.5 w-8 rounded-full bg-brand-600" />
      </h2>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {pages.map((page) => (
          <li key={page.to}>
            <Link
              to={page.to}
              className="card group flex h-full items-center gap-3 px-4 py-3.5 transition-all duration-200
                         hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-card-hover"
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600
                           transition-colors group-hover:bg-brand-600 group-hover:text-white"
              >
                <Icon name={page.icon} size={15} />
              </span>
              <span className="text-sm font-semibold text-ink-700 transition-colors group-hover:text-brand-600">
                {t(`ui.related.${page.key}`)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
