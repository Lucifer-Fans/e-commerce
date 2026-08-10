import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCartCount } from '../../store/cartSlice';
import useMediaQuery from '../../hooks/useMediaQuery';
import Icon from '../common/Icon';
import MobileCategorySheet from './MobileCategorySheet';
import usesHeaderShopIcons from './mobileNavScope';

/** Count pill sized to sit on a 22px icon without pushing the row around. */
function CountBadge({ count }) {
  if (!count) return null;
  return (
    <span className="absolute -right-2 -top-1 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-white ring-2 ring-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Shared shell for the four slots, so the link and the button match exactly. */
function TabInner({ icon, label, count, active }) {
  return (
    <>
      <span
        aria-hidden="true"
        className={`absolute left-1/2 top-0 h-0.5 w-8 -translate-x-1/2 rounded-b-full bg-brand-600 transition-opacity ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <span className="relative">
        <Icon name={icon} size={22} />
        <CountBadge count={count} />
      </span>
      <span className="text-[10px] font-semibold leading-none">{label}</span>
    </>
  );
}

/**
 * The whole mobile navigation: four fixed tabs at thumb height, replacing the
 * hamburger drawer. Cart and wishlist live here instead of the header, and
 * "Category" opens the two-pane category browser.
 *
 * Hidden from `lg` up, where the header's own nav and category strip take over.
 */
export default function MobileBottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const cartCount = useSelector(selectCartCount);
  const wishlistCount = useSelector((s) => s.wishlist.ids.length);
  // The bar itself is hidden with CSS, but the sheet locks page scroll while it
  // is open — so a rotate or resize past the breakpoint has to close it for real.
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [categoryOpen, setCategoryOpen] = useState(false);

  // Covers every way a route can change — a tap inside the sheet, the browser's
  // back button, or a redirect out of a guarded route.
  useEffect(() => {
    setCategoryOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (isDesktop) setCategoryOpen(false);
  }, [isDesktop]);

  // Every hook above runs first, so this stays a plain render decision.
  if (usesHeaderShopIcons(pathname)) return null;

  const tabClass = (active) =>
    `relative flex flex-1 flex-col items-center justify-center gap-1.5 transition-colors ${
      active ? 'text-brand-600' : 'text-ink-500'
    }`;

  // The sheet covers the page it was opened from, so while it is up the category
  // tab is the only one highlighted — the route underneath is no longer what the
  // shopper is looking at.
  const onRoute = (test) => !categoryOpen && test;

  const links = [
    { to: '/', icon: 'home', label: t('nav.home'), active: onRoute(pathname === '/') },
    {
      to: '/wishlist',
      icon: 'heart',
      label: t('nav.wishlist'),
      count: wishlistCount,
      active: onRoute(pathname.startsWith('/wishlist')),
    },
    {
      to: '/cart',
      icon: 'cart',
      label: t('nav.cart'),
      count: cartCount,
      active: onRoute(pathname.startsWith('/cart')),
    },
  ];

  return (
    <>
      <nav
        aria-label={t('a11y.menu')}
        className="fixed inset-x-0 bottom-0 z-[70] border-t border-ink-200 bg-white
                   shadow-[0_-2px_12px_rgba(15,23,42,.08)] lg:hidden"
      >
        {/* Padding, not margin, so the bar's own background reaches the screen
            edge on handsets with a home indicator. */}
        <div className="flex h-16 items-stretch pb-[env(safe-area-inset-bottom)]">
          <Link to={links[0].to} className={tabClass(links[0].active)}>
            <TabInner {...links[0]} />
          </Link>

          <button
            type="button"
            onClick={() => setCategoryOpen((v) => !v)}
            aria-expanded={categoryOpen}
            aria-haspopup="dialog"
            className={tabClass(categoryOpen)}
          >
            <TabInner icon="grid" label={t('nav.categories')} active={categoryOpen} />
          </button>

          {links.slice(1).map((link) => (
            <Link key={link.to} to={link.to} className={tabClass(link.active)}>
              <TabInner {...link} />
            </Link>
          ))}
        </div>
      </nav>

      <MobileCategorySheet open={categoryOpen} onClose={() => setCategoryOpen(false)} />
    </>
  );
}
