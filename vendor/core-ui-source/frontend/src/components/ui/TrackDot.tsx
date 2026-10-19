import type { CSSProperties } from 'react';

/**
 * TrackDot — small filled circle representing a Track / App / Workspace
 * identity color. Used in *list* contexts (tracks index, apps index,
 * mission control rows, workspace detail). Sidebar nav uses a vertical
 * bar (`TrackAccentDot`) with the same color convention.
 *
 * Detail page titles use a separate vertical bar via `PageHeading`.
 * Identity color applies only to those markers — not entry rows,
 * calendar tiles, gallery placeholders, or other content chrome.
 *
 * If `color` is empty, falls back to `--brand-accent` so unconfigured
 * entities still read as "Integral-themed" rather than gray.
 *
 * Sizes:
 *   - xs: 6px  (inline within typography)
 *   - sm: 8px  (default — list rows, breadcrumbs)
 *   - md: 10px (cards, hover targets)
 *   - lg: 14px (page headers)
 */
export type TrackDotSize = 'xs' | 'sm' | 'md' | 'lg';

interface TrackDotProps {
  color?: string | null;
  size?: TrackDotSize;
  className?: string;
  /** When true, applies a subtle ring for contrast on busy backgrounds. */
  ring?: boolean;
  title?: string;
}

const SIZE_PX: Record<TrackDotSize, number> = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
};

export function TrackDot({
  color,
  size = 'sm',
  className = '',
  ring = false,
  title,
}: TrackDotProps) {
  const px = SIZE_PX[size];
  const resolved = (color || '').trim() || 'var(--brand-accent)';
  const style: CSSProperties = {
    width: px,
    height: px,
    backgroundColor: resolved,
    boxShadow: ring ? '0 0 0 1.5px var(--panel)' : undefined,
  };
  return (
    <span
      aria-hidden={!title}
      title={title}
      className={`inline-block rounded-full flex-shrink-0 ${className}`}
      style={style}
    />
  );
}
