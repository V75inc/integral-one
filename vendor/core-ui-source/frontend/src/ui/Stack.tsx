/**
 * Stack — vertical layout primitive.
 *
 * Replaces `<div className="flex flex-col gap-N">` literals across
 * pages and features (17+ sites per INVENTORY §5). Pairs with `<Inline>`
 * (horizontal counterpart) — together they own all default layout
 * composition; pages should never reach for raw flex/gap utilities.
 *
 * Layer: Primitive (Layer 1 — pure composition, no token consumption
 * beyond Tailwind gap utilities).
 *
 * Usage:
 *   <Stack gap="md">
 *     <Text variant="heading-md">Title</Text>
 *     <Text tone="muted">Body</Text>
 *   </Stack>
 *
 * `align="stretch"` (default) makes children fill the cross axis —
 * the usual flex-col behaviour. Use `align="start"` to left-align
 * narrower children inside a wider container.
 */

import { type ElementType, type ReactNode } from 'react';

export type StackGap =
  | 'none' // 0
  | 'xs' // gap-1 (4px)
  | 'sm' // gap-2 (8px)
  | 'md' // gap-3 (12px) — default
  | 'lg' // gap-4 (16px)
  | 'xl' // gap-5 (20px)
  | '2xl'; // gap-6 (24px)

export type StackAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';

const GAP_CLASSES: Record<StackGap, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
  xl: 'gap-5',
  '2xl': 'gap-6',
};

const ALIGN_CLASSES: Record<StackAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

export interface StackProps {
  children: ReactNode;
  /** Vertical gap between children. Default: `md` (12px). */
  gap?: StackGap;
  /** Cross-axis alignment. Default: `stretch`. */
  align?: StackAlign;
  /** Render element. Default: `div`. */
  as?: ElementType;
  /**
   * Layout-positioning classes only (width, max-width caps, alignment
   * inside a flex/grid cell). NEVER spacing, color, typography — those
   * are owned by `gap` and the children's own primitives.
   */
  className?: string;
  /** HTML id. */
  id?: string;
  /** ARIA role override. */
  role?: string;
}

export function Stack({
  children,
  gap = 'md',
  align = 'stretch',
  as,
  className,
  id,
  role,
}: StackProps) {
  const Element = (as ?? 'div') as ElementType;
  const classes = [
    'flex flex-col',
    GAP_CLASSES[gap],
    ALIGN_CLASSES[align],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Element id={id} role={role} className={classes}>
      {children}
    </Element>
  );
}
