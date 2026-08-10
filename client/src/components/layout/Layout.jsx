import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import MobileBottomNav from './MobileBottomNav';
import usesHeaderShopIcons from './mobileNavScope';
import ScrollManager from './ScrollManager';
import RouteSkeleton from '../common/RouteSkeleton';
import ErrorBoundary from '../common/ErrorBoundary';

/** Shell shared by every storefront route. Route chunks stream into <Outlet />. */
export default function Layout() {
  const { pathname } = useLocation();
  // Routes that trade the bar for header icons need no room reserved for it.
  const hasBottomNav = !usesHeaderShopIcons(pathname);

  return (
    /* The bottom padding is the room the fixed mobile bar occupies, so the end of
       the footer is never left underneath it. */
    <div
      className={`flex min-h-screen flex-col ${
        hasBottomNav ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0' : ''
      }`}
    >
      {/* Sits outside <Suspense> so it reacts the instant the URL changes,
          rather than waiting on the incoming route chunk. */}
      <ScrollManager />

      <Header />

      <main className="flex-1">
        {/* Keyed by path so navigating away from a crashed page clears the error
            instead of leaving the boundary stuck on every subsequent route. */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<RouteSkeleton pathname={pathname} />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />

      <MobileBottomNav />
    </div>
  );
}
