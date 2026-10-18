import type { HTMLAttributes } from 'react';

/** Default stroke for Lucide line icons app-wide */
export const LINE_ICON_STROKE = 1.5 as const;

const shells = {
  default:
    'inline-flex shrink-0 items-center justify-center border border-[var(--panel-border)] bg-[var(--panel-2)] text-[var(--text-muted)]',
  brand:
    'inline-flex shrink-0 items-center justify-center border border-black/15 bg-[var(--brand-accent)] text-[var(--brand-accent-contrast)]',
} as const;

const sizes = {
  /** Modal title beat (Quiet Premium) — quiet 28px tile that reads as a
   *  punctuation mark, not a hero ornament. */
  xs: 'h-7 w-7 rounded-[0.4rem]',
  /** Header triggers — fixed radius (widget-style, not global lg bump) */
  sm: 'h-9 w-9 rounded-[0.5rem]',
  /** Page titles */
  md: 'h-11 w-11 rounded-[0.5rem]',
  /** Empty states, emphasis */
  lg: 'h-12 w-12 rounded-[0.5rem]',
} as const;

export type IconWellSize = keyof typeof sizes;
export type IconWellVariant = keyof typeof shells;

export interface IconWellProps extends HTMLAttributes<HTMLSpanElement> {
  size?: IconWellSize;
  /** `brand` — logo / app mark (`--brand-accent` background). */
  variant?: IconWellVariant;
  children: React.ReactNode;
}

/** Line icon on a neutral panel tile (no filled icon shapes). */
export function IconWell({
  size = 'md',
  variant = 'default',
  className = '',
  children,
  ...rest
}: IconWellProps) {
  return (
    <span
      className={`${shells[variant]} ${sizes[size]} ${className}`.trim()}
      {...rest}
    >
      {children}
    </span>
  );
}
