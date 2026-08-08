import { useTranslation } from 'react-i18next';
import ProductCard from './ProductCard';
import { ProductGridSkeleton } from '../common/Skeleton';
import EmptyState from '../common/EmptyState';

export default function ProductGrid({
  products = [],
  loading = false,
  skeletonCount = 10,
  emptyTitle,
  emptyMessage,
  emptyAction,
  columns = 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
}) {
  const { t } = useTranslation('shop');

  if (loading) return <ProductGridSkeleton count={skeletonCount} />;

  if (!products.length) {
    return (
      <EmptyState
        title={emptyTitle || t('grid.emptyTitle')}
        message={emptyMessage || t('grid.emptyMessage')}
        actionLabel={emptyAction?.label}
        actionTo={emptyAction?.to}
        onAction={emptyAction?.onClick}
      />
    );
  }

  return (
    <div className={`grid gap-4 ${columns}`}>
      {products.map((product) => (
        <ProductCard key={product._id} product={product} />
      ))}
    </div>
  );
}
