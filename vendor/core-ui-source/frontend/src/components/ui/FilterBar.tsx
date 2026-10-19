import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { LINE_ICON_STROKE } from './IconWell';

/**
 * Page search / filter bar — the single source of truth for its layout and
 * vertical rhythm. Every list page (Apps, Tracks, App detail, Workspace
 * members, Operational Models) and every entry-view filter row (Track detail —
 * all view types — and Feed) composes from here, so a spacing change lands in
 * ONE place instead of a dozen literal `mb-12` / `mt-12` scattered across pages.
 *
 * Tailwind needs LITERAL class strings (its JIT scans source for them), so the
 * values below are plain literals — edit them here; do not interpolate.
 */
export const filterBar = {
  /** Gap from the page divider / view tabs down to the filter bar (margin). */
  sectionTop: 'mt-12',
  /** Same gap expressed as padding, for sections that pad rather than margin. */
  sectionTopPad: 'pt-12',
  /** Gap from the filter bar down to the content (list / table / cards). */
  rowBottom: 'mb-12',
} as const;

/**
 * Standalone search row — left-aligned, capped width. Wrap a
 * {@link PageSearchInput} (or a loading shimmer) so the icon's absolute
 * positioning resolves against the `relative` container.
 */
export function SearchRow({ children }: { children: ReactNode }) {
  return (
    <div className={`${filterBar.rowBottom} flex justify-start`}>
      <div className="relative w-full max-w-xl">{children}</div>
    </div>
  );
}

/**
 * Search + accessorial-controls row. App-wide rule: the search field goes
 * FIRST (left); all accessorial filters/controls/actions go to the RIGHT of it
 * (e.g. a "New …" button on entry views, scope chips on Operational Models).
 * Owns the row's spacing + flex layout (`justify-between`); callers supply the
 * search strip first (wrap it in `w-full max-w-xl min-w-[min(100%,18rem)]`)
 * then the trailing controls.
 */
export function FilterActionRow({ children }: { children: ReactNode }) {
  return (
    <div
      className={`${filterBar.rowBottom} flex flex-wrap items-start justify-between gap-x-4 gap-y-3`}
    >
      {children}
    </div>
  );
}

/**
 * The standard page search field (leading icon + input). Render inside a
 * {@link SearchRow} so the absolutely-positioned icon anchors correctly.
 */
export function PageSearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel?: string;
}) {
  return (
    <>
      <Search
        size={14}
        strokeWidth={LINE_ICON_STROKE}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
        aria-hidden
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        className="
          w-full pl-9 pr-3 py-2 text-sm
          rounded-[var(--radius-input)]
          bg-[var(--panel)] border border-[var(--panel-border)]
          text-[var(--text)] placeholder:text-[var(--text-subtle)]
          hover:border-[var(--text-subtle)]
          focus:outline-none focus:border-[var(--text-muted)] focus:bg-[var(--panel-2)]
          transition-colors duration-fast
        "
      />
    </>
  );
}
