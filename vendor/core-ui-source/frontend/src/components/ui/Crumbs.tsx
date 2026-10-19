import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/**
 * Crumbs — breadcrumb navigation. Each crumb may render as a Link (when
 * `to` is provided) or as plain text (last/current item). Optional leading
 * `dot` slot accepts a TrackDot or other small adornment.
 *
 * Render order: dot? · label · separator · ... · current label.
 */
export interface Crumb {
  label: string;
  to?: string;
  /** Optional adornment rendered immediately before the label. */
  dot?: ReactNode;
  /** Truncate this crumb's label after this many chars. */
  maxChars?: number;
}

interface CrumbsProps {
  items: Crumb[];
  className?: string;
  separator?: ReactNode;
}

function truncate(s: string, max?: number) {
  if (!max || s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

export function Crumbs({
  items,
  className = '',
  separator,
}: CrumbsProps) {
  const sep =
    separator ?? (
      <span className="mx-1.5 text-[var(--text-subtle)] select-none" aria-hidden>
        /
      </span>
    );
  const last = items.length - 1;

  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex flex-wrap items-center text-sm ${className}`}
    >
      {items.map((c, i) => {
        const label = truncate(c.label, c.maxChars);
        const isLast = i === last;
        const inner = (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            {c.dot}
            <span className="truncate">{label}</span>
          </span>
        );
        return (
          <span key={i} className="inline-flex items-center min-w-0">
            {c.to && !isLast ? (
              <Link
                to={c.to}
                className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors duration-fast"
                title={c.label}
              >
                {inner}
              </Link>
            ) : (
              <span
                className={isLast ? 'text-[var(--text)] font-medium' : 'text-[var(--text-muted)]'}
                title={c.label}
                aria-current={isLast ? 'page' : undefined}
              >
                {inner}
              </span>
            )}
            {!isLast && sep}
          </span>
        );
      })}
    </nav>
  );
}
