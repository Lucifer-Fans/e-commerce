/** Layout-matched loading placeholders — they prevent content shift on load. */

export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded ${className}`} />;
}

export function ProductCardSkeleton() {
  return (
    <div className="card overflow-hidden p-3">
      <Skeleton className="mb-3 aspect-square w-full rounded-lg" />
      <Skeleton className="mb-2 h-3 w-2/5" />
      <Skeleton className="mb-2 h-4 w-full" />
      <Skeleton className="mb-3 h-4 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 10 }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ProductDetailSkeleton() {
  return (
    <div className="container-page py-6">
      <Skeleton className="mb-6 h-4 w-1/3" />
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <Skeleton className="mb-4 aspect-square w-full rounded-xl" />
          <div className="flex gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-20 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24 w-full" />
          <div className="flex gap-3">
            <Skeleton className="h-12 flex-1 rounded-lg" />
            <Skeleton className="h-12 flex-1 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProductGridPageSkeleton({ count = 10 }) {
  return (
    <div className="container-page py-5">
      <Skeleton className="mb-5 h-7 w-48" />
      <ProductGridSkeleton count={count} />
    </div>
  );
}

export function ListRowSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="card flex items-center gap-4 p-4">
          <Skeleton className="h-20 w-20 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-4 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default Skeleton;
