import { Skeleton } from '../common/Skeleton';

/**
 * Suspense fallback for the brief moment a namespace chunk is in flight — on a
 * language switch, or the first time a route pulls in a namespace it hasn't used.
 *
 * It reuses the shared `.skeleton` shimmer rather than a spinner so a language
 * change looks like the rest of the site loading, not like an error state.
 */
export default function TranslationSkeleton({ lines = 6, className = '' }) {
  return (
    <div className={`container-page py-8 ${className}`} role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="mb-6 h-7 w-52" />
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i % 3 === 2 ? 'w-2/5' : 'w-full'}`} />
        ))}
      </div>
    </div>
  );
}

/** Matches the account pages' card stack while their namespace loads. */
export function AccountPanelSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-6 w-40" />
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="card space-y-3 p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-full max-w-md rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
