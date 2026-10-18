export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--panel-2)] rounded-lg ${className}`} />;
}

/** EntryCard-shaped skeleton — editorial hairline row with dot prefix,
 *  title, body, meta-row chips, and a right-aligned date column at sm+.
 *  Mirrors the production EntryCard exactly so the load state doesn't
 *  jump on first paint. */
export function CardSkeleton() {
  return (
    <div
      className="
        relative grid gap-x-[20px] py-[34px] px-3
        grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto]
        min-w-0 max-w-full
        border-b border-[var(--border-subtle)] last:border-b-0
      "
    >
      {/* Dot */}
      <Skeleton className="w-2.5 h-2.5 rounded-full mt-[7px] shrink-0" />
      {/* Main column */}
      <div className="min-w-0">
        <Skeleton className="h-[18px] w-[55%] max-w-[420px] rounded" />
        <div className="mt-3 space-y-1.5">
          <Skeleton className="h-3.5 w-full max-w-[600px] rounded" />
          <Skeleton className="h-3.5 w-[80%] max-w-[480px] rounded" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-[14px] gap-y-1">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
      </div>
      {/* Date column — sm+ only */}
      <div className="hidden sm:flex flex-col items-end gap-1 shrink-0">
        <Skeleton className="h-3 w-12 rounded" />
        <Skeleton className="h-3 w-10 rounded" />
      </div>
    </div>
  );
}
