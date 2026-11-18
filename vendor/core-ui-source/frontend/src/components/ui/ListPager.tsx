import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { LINE_ICON_STROKE } from './IconWell';

/**
 * Page controls for a list that has a known total: "26–50 of 986", first / previous / page numbers / next / last,
 * and a page-size choice. The parent owns the page number and the size; the server returns each page.
 */

export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** Page numbers to show: the first, the last and a window around the current page, with gaps as ``null``. */
export function pageWindow(page: number, pages: number): Array<number | null> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const keep = new Set([1, pages, page - 1, page, page + 1]);
  if (page <= 3) { keep.add(2); keep.add(3); keep.add(4); }
  if (page >= pages - 2) { keep.add(pages - 1); keep.add(pages - 2); keep.add(pages - 3); }
  const sorted = [...keep].filter(n => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out: Array<number | null> = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

const buttonClass = (active = false) =>
  [
    'inline-flex h-8 min-w-8 items-center justify-center rounded-[var(--radius-input)] border px-2 text-sm tabular-nums',
    'transition-colors duration-fast disabled:cursor-not-allowed disabled:opacity-40',
    active
      ? 'border-[var(--panel-border)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)] font-semibold'
      : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]',
  ].join(' ');

export function ListPager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = PAGE_SIZES,
  busy = false,
  label = 'records',
}: {
  /** 1-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange(page: number): void;
  onPageSizeChange?(size: number): void;
  pageSizes?: readonly number[];
  busy?: boolean;
  label?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), pages);
  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(total, current * pageSize);
  const go = (n: number) => { if (!busy && n >= 1 && n <= pages && n !== current) onPageChange(n); };

  return (
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-sm text-[var(--text-muted)] tabular-nums" aria-live="polite">
        {total === 0 ? `No ${label}` : `${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()} ${label}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-[var(--text-muted)]">
            Rows per page
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="app-input h-8 w-20 py-0 text-sm"
              aria-label="Rows per page"
            >
              {pageSizes.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" className={buttonClass()} onClick={() => go(1)} disabled={busy || current === 1} aria-label="First page">
              <ChevronsLeft size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </button>
            <button type="button" className={buttonClass()} onClick={() => go(current - 1)} disabled={busy || current === 1} aria-label="Previous page">
              <ChevronLeft size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </button>
            {pageWindow(current, pages).map((n, i) => n === null ? (
              <span key={`gap-${i}`} className="px-1 text-[var(--text-subtle)]" aria-hidden>…</span>
            ) : (
              <button
                key={n}
                type="button"
                className={buttonClass(n === current)}
                onClick={() => go(n)}
                disabled={busy}
                aria-label={`Page ${n}`}
                aria-current={n === current ? 'page' : undefined}
              >
                {n}
              </button>
            ))}
            <button type="button" className={buttonClass()} onClick={() => go(current + 1)} disabled={busy || current === pages} aria-label="Next page">
              <ChevronRight size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </button>
            <button type="button" className={buttonClass()} onClick={() => go(pages)} disabled={busy || current === pages} aria-label="Last page">
              <ChevronsRight size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
