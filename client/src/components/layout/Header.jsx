import { useState, useCallback } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { logout } from '../../store/authSlice';
import { resetCart, selectCartCount } from '../../store/cartSlice';
import { resetWishlist } from '../../store/wishlistSlice';
import useClickOutside from '../../hooks/useClickOutside';
import useSettings from '../../settings/useSettings';
import BrandMark from '../common/BrandMark';
import Icon from '../common/Icon';
import UserAvatar from '../common/UserAvatar';
import SearchBar from './SearchBar';
import CategoryNav from './CategoryNav';
import MobileMenu from './MobileMenu';

function CountBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -right-1.5 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white ring-2 ring-ink-900">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function Header() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { siteName } = useSettings();

  const { isAuthenticated, user } = useSelector((s) => s.auth);
  const cartCount = useSelector(selectCartCount);
  const wishlistCount = useSelector((s) => s.wishlist.ids.length);

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const accountRef = useClickOutside(useCallback(() => setAccountOpen(false), []), accountOpen);

  const handleLogout = async () => {
    setAccountOpen(false);
    await dispatch(logout());
    // Clear the personalised slices so the next visitor doesn't see stale data.
    dispatch(resetCart());
    dispatch(resetWishlist());
    toast.success(t('nav.loggedOut'));
    navigate('/');
  };

  const accountLinks = [
    { to: '/account', label: t('nav.myProfile'), icon: 'user' },
    { to: '/account/orders', label: t('nav.myOrders'), icon: 'package' },
    { to: '/account/addresses', label: t('nav.addresses'), icon: 'location' },
    { to: '/wishlist', label: t('nav.wishlist'), icon: 'heart' },
    { to: '/account/devices', label: t('nav.devices'), icon: 'monitor' },
    { to: '/account/settings', label: t('nav.settings'), icon: 'settings' },
  ];

  return (
    <>
      {/* Sticky so search and cart are always one tap away while browsing. */}
      <header className="sticky top-0 z-50 shadow-header">
        {/* relative + z-20 keeps the account dropdown above the category strip below. */}
        <div className="relative z-20 bg-ink-900 text-white">
          <div className="container-page flex items-center gap-3 py-3 lg:gap-6">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden"
              aria-label={t('a11y.openMenu')}
            >
              <Icon name="menu" size={22} />
            </button>

            <Link
              to="/"
              className="flex shrink-0 items-center gap-2"
              aria-label={t('a11y.homeLink', { app: siteName })}
            >
              {/* Name is hidden on the narrowest screens so the search field keeps its room. */}
              <BrandMark nameClassName="hidden sm:block" />
            </Link>

            <SearchBar className="hidden flex-1 lg:block" />

            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setMobileSearchOpen((v) => !v)}
                className="rounded-lg p-2 hover:bg-white/10 lg:hidden"
                aria-label={t('a11y.search')}
              >
                <Icon name="search" size={20} />
              </button>

              {isAuthenticated ? (
                <div ref={accountRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountOpen((v) => !v)}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-white/10"
                    aria-expanded={accountOpen}
                    aria-haspopup="menu"
                  >
                    <UserAvatar user={user} size={26} ring />
                    <span className="hidden max-w-[110px] truncate text-sm font-medium xl:block">
                      {user.name.split(' ')[0]}
                    </span>
                    <Icon name="chevronDown" size={14} className="hidden xl:block" />
                  </button>

                  {accountOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 top-[calc(100%+8px)] w-60 animate-fade-in overflow-hidden rounded-xl border border-ink-200 bg-white py-1.5 text-ink-800 shadow-card-hover"
                    >
                      <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
                        <UserAvatar user={user} size={38} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{user.name}</p>
                          <p className="truncate text-xs text-ink-500">{user.email}</p>
                        </div>
                      </div>

                      {accountLinks.map((link) => (
                        <Link
                          key={link.to}
                          to={link.to}
                          role="menuitem"
                          onClick={() => setAccountOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-ink-50"
                        >
                          <Icon name={link.icon} size={16} className="text-ink-400" />
                          {link.label}
                        </Link>
                      ))}

                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 border-t border-ink-100 px-4 py-2.5 text-sm text-danger hover:bg-red-50"
                      >
                        <Icon name="logout" size={16} />
                        {t('nav.logout')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <Link
                  to="/login"
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-white/10"
                >
                  <Icon name="user" size={20} />
                  <span className="hidden sm:block">{t('nav.login')}</span>
                </Link>
              )}

              <NavLink
                to="/wishlist"
                className="relative rounded-lg p-2 hover:bg-white/10"
                aria-label={t('nav.wishlist')}
              >
                <Icon name="heart" size={20} />
                <CountBadge count={wishlistCount} />
              </NavLink>

              <NavLink
                to="/cart"
                className="relative rounded-lg p-2 hover:bg-white/10"
                aria-label={t('nav.cart')}
              >
                <Icon name="cart" size={20} />
                <CountBadge count={cartCount} />
              </NavLink>
            </div>
          </div>

          {mobileSearchOpen && (
            <div className="container-page pb-3 lg:hidden">
              <SearchBar autoFocus onNavigate={() => setMobileSearchOpen(false)} />
            </div>
          )}
        </div>

        <div className="hidden lg:block">
          <CategoryNav />
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
