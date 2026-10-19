/**
 * Inline — horizontal layout primitive.
 *
 * Replaces `<div className="flex items-center gap-N">` literals across
 * pages and features. Pairs with `<Stack>` (vertical counterpart).
 *
 * Layer: Primitive (Layer 1 — pure composition).
 *
 * Usage:
 *   <Inline gap="sm" align="center">
 *     <Icon />
 *     <Text>Label</Text>
 *   </Inline>
 *
 *   <Inline gap="md" justify="between" wrap>
 *     <Text variant="heading-sm">Card title</Text>
 *     <Button>Action</Button>
 *   </Inline>
 */

import { type ElementType, type ReactNode } from 'react';

export type InlineGap =
  | 'none' // 0
  | 'xs' // gap-1 (4px)
  | 'sm' // gap-2 (8px)
  | 'md' // gap-3 (12px) — default
  | 'lg' // gap-4 (16px)
  | 'xl' // gap-5 (20px)
  | '2xl'; // gap-6 (24px)

export type InlineAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type InlineJustify = 'start' | 'center' | 'end' | 'between' | 'around';

const GAP_CLASSES: Record<InlineGap, string> = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
  xl: 'gap-5',
  '2xl': 'gap-6',
};

const ALIGN_CLASSES: Record<InlineAlign, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
};

const JUSTIFY_CLASSES: Record<InlineJustify, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
  around: 'justify-around',
};

export interface InlineProps {
  children: ReactNode;
  /** Horizontal gap between children. Default: `md` (12px). */
  gap?: InlineGap;
  /** Cross-axis (vertical) alignment. Default: `center`. */
  align?: InlineAlign;
  /** Main-axis (horizontal) justification. Default: `start`. */
  justify?: InlineJustify;
  /** Allow children to wrap onto multiple lines. */
  wrap?: boolean;
  /** Render element. Default: `div`. */
  as?: ElementType;
  /**
   * Layout-positioning classes only (width, max-width caps, alignment
   * inside a parent flex/grid cell). NEVER spacing, color, typography.
   */
  className?: string;
  /** HTML id. */
  id?: string;
  /** ARIA role override. */
  role?: string;
}

export function Inline({
  children,
  gap = 'md',
  align = 'center',
  justify = 'start',
  wrap = false,
  as,
  className,
  id,
  role,
}: InlineProps) {
  const Element = (as ?? 'div') as ElementType;
  const classes = [
    'flex flex-row',
    wrap ? 'flex-wrap' : '',
    GAP_CLASSES[gap],
    ALIGN_CLASSES[align],
    JUSTIFY_CLASSES[justify],
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
