import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import ScrollManager from './ScrollManager';
import { PageLoader } from '../common/Spinner';
import ErrorBoundary from '../common/ErrorBoundary';

/** Shell shared by every storefront route. Route chunks stream into <Outlet />. */
export default function Layout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Sits outside <Suspense> so it reacts the instant the URL changes,
          rather than waiting on the incoming route chunk. */}
      <ScrollManager />

      <Header />

      <main className="flex-1">
        {/* Keyed by path so navigating away from a crashed page clears the error
            instead of leaving the boundary stuck on every subsequent route. */}
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
    </div>
  );
}
