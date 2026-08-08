import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Icon from '../common/Icon';
import UserAvatar from '../common/UserAvatar';
import { optimisedImage } from '../../utils/format';

/** Slide-in drawer that mirrors the desktop category nav on small screens. */
export default function MobileMenu({ open, onClose }) {
  const { t } = useTranslation();
  const { categories } = useSelector((s) => s.catalog);
  const { isAuthenticated, user } = useSelector((s) => s.auth);
  const [expandedId, setExpandedId] = useState(null);

  if (!open) return null;

  const close = () => {
    setExpandedId(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] lg:hidden">
      <div className="absolute inset-0 bg-ink-900/50" onClick={close} aria-hidden="true" />

      <aside
        className="absolute left-0 top-0 flex h-full w-[85%] max-w-sm animate-slide-up flex-col bg-white shadow-2xl"
        role="dialog"
        aria-label={t('a11y.menu')}
      >
        <div className="flex items-center justify-between border-b border-ink-200 bg-ink-900 px-4 py-4 text-white">
          <div className="flex min-w-0 items-center gap-3">
            {isAuthenticated && <UserAvatar user={user} size={40} ring />}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {isAuthenticated
                  ? t('nav.greeting', { name: user.name.split(' ')[0] })
                  : t('nav.welcome')}
              </p>
              <p className="truncate text-xs text-ink-300">
                {isAuthenticated ? user.email : t('nav.loginPrompt')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 hover:bg-white/10"
            aria-label={t('a11y.closeMenu')}
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {[
            { to: '/products', label: t('nav.allProducts'), icon: 'grid' },
            { to: '/wishlist', label: t('nav.wishlist'), icon: 'heart' },
            { to: '/cart', label: t('nav.cart'), icon: 'cart' },
            { to: '/account/orders', label: t('nav.myOrders'), icon: 'package' },
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              onClick={close}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              <Icon name={link.icon} size={18} className="text-ink-400" />
              {link.label}
            </Link>
          ))}

          <p className="mt-3 border-t border-ink-100 px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-ink-400">
            {t('nav.shopByCategory')}
          </p>

          {categories.map((category) => {
            const hasChildren = category.subCategories?.length > 0;
            const isExpanded = expandedId === category._id;

            return (
              <div key={category._id} className="border-b border-ink-50 last:border-0">
                <div className="flex items-center">
                  <Link
                    to={`/products?category=${category.slug}`}
                    onClick={close}
                    className="flex flex-1 items-center gap-2.5 px-4 py-3 text-sm font-medium text-ink-700"
                  >
                    {category.image?.url && (
                      <img
                        src={optimisedImage(category.image.url, { width: 56, height: 56 })}
                        alt=""
                        loading="lazy"
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    )}
                    {category.name}
                  </Link>
                  {hasChildren && (
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : category._id)}
                      className="px-4 py-3 text-ink-400"
                      aria-label={t(isExpanded ? 'a11y.collapse' : 'a11y.expand', {
                        name: category.name,
                      })}
                      aria-expanded={isExpanded}
                    >
                      <Icon name={isExpanded ? 'chevronUp' : 'chevronDown'} size={16} />
                    </button>
                  )}
                </div>

                {hasChildren && isExpanded && (
                  <div className="bg-ink-50 pb-2">
                    {category.subCategories.map((sub) => (
                      <Link
                        key={sub._id}
                        to={`/products?category=${category.slug}&subCategory=${sub.slug}`}
                        onClick={close}
                        className="block py-2 pl-10 pr-4 text-sm text-ink-600 hover:text-brand-600"
                      >
                        {sub.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {!isAuthenticated && (
          <div className="flex gap-3 border-t border-ink-200 p-4">
            <Link to="/login" onClick={close} className="btn-primary flex-1">
              {t('nav.login')}
            </Link>
            <Link to="/register" onClick={close} className="btn-outline flex-1">
              {t('nav.signup')}
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
