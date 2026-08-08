import { Suspense } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { logout } from '../../store/authSlice';
import { resetCart } from '../../store/cartSlice';
import { resetWishlist } from '../../store/wishlistSlice';
import Seo from '../../components/common/Seo';
import Icon from '../../components/common/Icon';
import Breadcrumb from '../../components/common/Breadcrumb';
import UserAvatar from '../../components/common/UserAvatar';
import { AccountPanelSkeleton } from '../../components/language/TranslationSkeleton';

const NAV = [
  { to: '/account', key: 'profile', icon: 'user', end: true },
  { to: '/account/orders', key: 'myOrders', icon: 'package' },
  { to: '/account/addresses', key: 'addresses', icon: 'location' },
  { to: '/wishlist', key: 'wishlist', icon: 'heart' },
  { to: '/account/devices', key: 'devices', icon: 'monitor' },
  { to: '/account/settings', key: 'settings', icon: 'settings' },
];

export default function AccountLayout() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector((s) => s.auth.user);

  const handleLogout = async () => {
    await dispatch(logout());
    dispatch(resetCart());
    dispatch(resetWishlist());
    toast.success(t('nav.loggedOut'));
    navigate('/');
  };

  return (
    <>
      <Seo title={t('nav.myAccount')} noIndex />

      <div className="container-page py-5">
        <Breadcrumb items={[{ label: t('nav.myAccount') }]} className="mb-4" />

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-[160px] lg:self-start">
            <div className="card overflow-hidden">
              <div className="flex items-center gap-3 border-b border-ink-100 bg-ink-50 p-4">
                <UserAvatar user={user} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-ink-900">{user?.name}</p>
                  <p className="truncate text-xs text-ink-500">{user?.email}</p>
                </div>
              </div>

              <nav className="p-2">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'
                      }`
                    }
                  >
                    <Icon name={item.icon} size={17} />
                    {t(`nav.${item.key}`)}
                  </NavLink>
                ))}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-danger transition hover:bg-red-50"
                >
                  <Icon name="logout" size={17} />
                  {t('nav.logout')}
                </button>
              </nav>
            </div>
          </aside>

          <div className="min-w-0">
            {/* Covers both the route chunk and its `account` translation bundle —
                a card-shaped skeleton reads as loading, not as an empty account. */}
            <Suspense fallback={<AccountPanelSkeleton />}>
              <Outlet />
            </Suspense>
          </div>
        </div>
      </div>
    </>
  );
}
