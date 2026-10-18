/**
 * AsyncBoundary — collapses the loading / error / empty / success
 * branching boilerplate that wraps every React-Query consumer in the
 * app. Replaces the 25+ hand-rolled triplets identified in
 * `.planning/ui-templating/INVENTORY.md` § 20.
 *
 * Usage:
 *
 *   const conflicts = useQuery({ queryKey: ['conflicts'], queryFn });
 *
 *   <AsyncBoundary
 *     query={conflicts}
 *     emptyFallback={<EmptyState title="No conflicts" />}
 *   >
 *     {(data) => <ConflictsList items={data.items} />}
 *   </AsyncBoundary>
 *
 * What it does:
 * - `isLoading` → renders `loadingFallback` (default: `<Skeleton>`).
 * - `isError`   → renders `errorFallback(error)` (default: inline danger
 *                 text + retry text). Pass `silenceError` to suppress.
 * - `isEmpty(data)` → renders `emptyFallback`. Default predicate:
 *                 `data == null` OR `Array.isArray(data) && data.length === 0`.
 * - else        → renders `children(data)`.
 *
 * Layer: Pattern (Layer 2 — composes Primitives Text + the existing
 * Skeleton). See `.planning/ui-templating/adr-frontend-layering.md`.
 */

import { type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';

import { Skeleton } from '../components/ui/Skeleton';
import { Text } from '../ui';

export type AsyncBoundarySkeleton = 'block' | 'list' | 'card' | 'inline';

export interface AsyncBoundaryProps<TData> {
  /** React-Query result (any `UseQueryResult` shape). */
  query: UseQueryResult<TData, Error> | UseQueryResult<TData, unknown>;
  /** Renders when the query has resolved with non-empty data. */
  children: (data: NonNullable<TData>) => ReactNode;
  /** Override the loading state. Default: `<Skeleton>` matching `skeleton`. */
  loadingFallback?: ReactNode;
  /** Override the error state. Receives the error. */
  errorFallback?: (error: Error) => ReactNode;
  /**
   * Renders when the query succeeded but `isEmpty(data)` returns true.
   * Required — empty messaging is per-surface and shouldn't be defaulted.
   */
  emptyFallback: ReactNode;
  /**
   * Returns true when the resolved data is "empty" (no rows, no items,
   * etc). Default: `data == null || (Array.isArray(data) && !data.length)`.
   * Override for shapes like `{ items: [] }` or paged responses.
   */
  isEmpty?: (data: NonNullable<TData>) => boolean;
  /** Silence the error UI; render `emptyFallback` instead. */
  silenceError?: boolean;
  /**
   * Default skeleton flavour. Ignored when `loadingFallback` is set.
   * - `block` (default): 64px tall full-width block.
   * - `list`: three stacked rows mimicking a list.
   * - `card`: 96px tall card-shaped block.
   * - `inline`: 20px tall full-width line (for inline async values).
   */
  skeleton?: AsyncBoundarySkeleton;
  /** Optional label for the loading skeleton (aria-live). */
  loadingLabel?: string;
}

function defaultIsEmpty<T>(data: T): boolean {
  if (data == null) return true;
  if (Array.isArray(data)) return data.length === 0;
  // Shape `{ items: [...] }` is the next-most-common convention in this codebase.
  if (typeof data === 'object' && 'items' in (data as object)) {
    const items = (data as unknown as { items: unknown }).items;
    if (Array.isArray(items)) return items.length === 0;
  }
  return false;
}

function defaultSkeleton(variant: AsyncBoundarySkeleton, label?: string): ReactNode {
  switch (variant) {
    case 'list':
      return (
        <div className="flex flex-col gap-2" role="status" aria-live="polite" aria-label={label}>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      );
    case 'card':
      return <Skeleton className="h-24 w-full" />;
    case 'inline':
      return <Skeleton className="h-5 w-full" />;
    case 'block':
    default:
      return <Skeleton className="h-16 w-full" />;
  }
}

function defaultErrorFallback(error: Error): ReactNode {
  return (
    <Text variant="body" tone="danger" as="p">
      {error.message || 'Something went wrong loading this view.'}
    </Text>
  );
}

export function AsyncBoundary<TData>({
  query,
  children,
  loadingFallback,
  errorFallback,
  emptyFallback,
  isEmpty = defaultIsEmpty,
  silenceError = false,
  skeleton = 'block',
  loadingLabel,
}: AsyncBoundaryProps<TData>): ReactNode {
  if (query.isLoading) {
    return loadingFallback ?? defaultSkeleton(skeleton, loadingLabel);
  }
  if (query.isError) {
    if (silenceError) return emptyFallback;
    const err = query.error instanceof Error
      ? query.error
      : new Error(typeof query.error === 'string' ? query.error : 'Unknown error');
    return (errorFallback ?? defaultErrorFallback)(err);
  }

  // Success branch — TanStack Query types `data` as `TData | undefined`
  // until isLoading/isError have been ruled out; even after, the
  // discriminated union isn't tight enough for TS to drop `undefined`.
  // We've ruled out loading + error above, so `data` is `TData` from a
  // semantics standpoint — but it could still be `null | undefined` if
  // the query function returned that. `isEmpty` handles both.
  const data = query.data as NonNullable<TData> | null | undefined;
  if (data == null || isEmpty(data as NonNullable<TData>)) {
    return emptyFallback;
  }
  return children(data as NonNullable<TData>);
}
