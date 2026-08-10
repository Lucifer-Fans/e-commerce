import {
  ListRowSkeleton,
  ProductDetailSkeleton,
  ProductGridPageSkeleton,
} from './Skeleton';
import TranslationSkeleton, {
  AccountPanelSkeleton,
} from '../language/TranslationSkeleton';

/**
 * Suspense fallback for a route chunk that is still downloading.
 *
 * Matching the shimmer to the incoming page keeps the layout from collapsing
 * between header and footer, and on the routes that skeleton their own data
 * (product detail, the account panels) the placeholder simply carries straight
 * through from chunk to fetch instead of flashing a spinner in between.
 */
export default function RouteSkeleton({ pathname = '' }) {
  const path = pathname.replace(/\/+$/, '') || '/';

  if (path === '/' || path === '/products' || path === '/wishlist') {
    return <ProductGridPageSkeleton />;
  }

  if (path.startsWith('/product/')) return <ProductDetailSkeleton />;

  if (path === '/cart' || path === '/checkout' || path.startsWith('/order-success/')) {
    return (
      <div className="container-page py-6">
        <ListRowSkeleton rows={3} />
      </div>
    );
  }

  if (path === '/account' || path.startsWith('/account/')) {
    return (
      <div className="container-page py-6">
        <AccountPanelSkeleton />
      </div>
    );
  }

  // Auth, contact, careers, 404 — short pages with no shared shape worth guessing.
  return <TranslationSkeleton lines={5} />;
}
