/**
 * Surface — panel / card primitive.
 *
 * Renders a backgrounded, optionally bordered, optionally shadowed
 * container. Replaces the 35+ raw `bg-[var(--panel)] border
 * border-[var(--panel-border)] rounded-[var(--radius-card)]` literal
 * combinations found across feature code (see
 * `.planning/ui-templating/INVENTORY.md` § 4).
 *
 * Compose with `<Text>` and `<Stack>` (Phase 4) for the standard
 * panel-with-heading pattern.
 *
 * See:
 * - `.planning/ui-templating/adr-frontend-layering.md` — primitive rules.
 * - `.planning/ui-templating/TOKENS.md` § Surface + § Radii + § Shadows.
 *
 * **Forbidden:** passing arbitrary Tailwind classes via `className` for
 * size, spacing, color, or radius. Use `tone`, `border`, `radius`,
 * `elevation`, or `padding` instead. `className` is reserved for layout
 * positioning (grid placement, alignment, flex sizing).
 */

import { forwardRef, type ElementType, type HTMLAttributes, type ReactNode } from 'react';

/** Background color tier. */
export type SurfaceTone =
  | 'panel' // --panel (default card surface)
  | 'panel-2' // --panel-2 (inset / secondary surface)
  | 'transparent'; // no background (border / radius only)

/** Border style + color. */
export type SurfaceBorder =
  | 'default' // --panel-border (default hairline)
  | 'subtle' // --border-subtle (quieter divider color)
  | 'entry-table' // stronger edge around editable entry tables
  | 'transparent'
  | 'none';

/** Corner radius. */
export type SurfaceRadius =
  | 'card' // --radius-card (14px — cards, panels, dialogs)
  | 'input' // --radius-input (8px — inputs, buttons)
  | 'pill' // --radius-pill (9999px)
  | 'none';

/** Drop shadow. */
export type SurfaceElevation =
  | 'flat' // no shadow
  | 'sm' // --shadow-sm (hover / badges)
  | 'card' // --shadow-card (cards, popovers)
  | 'pop'; // --shadow-pop (dialogs, command palette)

/** Padding preset. Use `'none'` for hand-rolled inner layouts. */
export type SurfacePadding = 'none' | 'xs' | 'sm' | 'md' | 'lg';
export type SurfaceBackgroundOpacity = 30 | 40;

const WASH_CLASSES: Record<SurfaceBackgroundOpacity, string> = {
  30: 'bg-[var(--panel-2)]/30',
  40: 'bg-[var(--panel-2)]/40',
};

const TONE_CLASSES: Record<SurfaceTone, string> = {
  panel: 'bg-[var(--panel)]',
  'panel-2': 'bg-[var(--panel-2)]',
  transparent: '',
};

const HOVER_TONE_CLASSES: Record<SurfaceTone, string> = {
  panel: 'hover:bg-[var(--panel)]',
  'panel-2': 'hover:bg-[var(--panel-2)]',
  transparent: 'hover:bg-transparent',
};

const BORDER_CLASSES: Record<SurfaceBorder, string> = {
  default: 'border border-[var(--panel-border)]',
  subtle: 'border border-[var(--border-subtle)]',
  'entry-table': 'border border-[var(--entry-table-border)]',
  transparent: 'border border-transparent',
  none: '',
};

const BORDER_STYLE_CLASSES = {
  solid: '',
  dashed: 'border-dashed',
} as const;

const RADIUS_CLASSES: Record<SurfaceRadius, string> = {
  card: 'rounded-[var(--radius-card)]',
  input: 'rounded-[var(--radius-input)]',
  pill: 'rounded-[var(--radius-pill)]',
  none: '',
};

const ELEVATION_CLASSES: Record<SurfaceElevation, string> = {
  flat: '',
  sm: 'shadow-[var(--shadow-sm)]',
  card: 'shadow-[var(--shadow-card)]',
  pop: 'shadow-[var(--shadow-pop)]',
};

const PADDING_CLASSES: Record<SurfacePadding, string> = {
  none: '',
  xs: 'px-1 py-0',
  sm: 'p-2',
  md: 'p-3',
  lg: 'p-4 sm:p-5',
};

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  /** Background. Default: `panel`. */
  tone?: SurfaceTone;
  /** Border style. Default: `default`. */
  border?: SurfaceBorder;
  borderStyle?: keyof typeof BORDER_STYLE_CLASSES;
  /** Corner radius. Default: `card`. */
  radius?: SurfaceRadius;
  /** Drop shadow. Default: `flat`. */
  elevation?: SurfaceElevation;
  /** Inner padding. Default: `none` — let the caller compose interior layout. */
  padding?: SurfacePadding;
  /** Apply a restrained wash to a secondary panel background. */
  backgroundOpacity?: SurfaceBackgroundOpacity;
  /** Optional background tone on pointer hover. */
  hoverTone?: SurfaceTone;
  /** Render element. Default: `div`. */
  as?: ElementType;
  /**
   * Layout-positioning classes only — `flex`, `grid`, `min-w-0`, span,
   * alignment overrides. NEVER background, border, radius, shadow, or
   * padding utilities — those belong to the typed props above.
   */
  className?: string;
  type?: string;
  'data-testid'?: string;
}

export const Surface = forwardRef<HTMLElement, SurfaceProps>(function Surface({
  children,
  tone = 'panel',
  border = 'default',
  borderStyle = 'solid',
  radius = 'card',
  elevation = 'flat',
  padding = 'none',
  backgroundOpacity,
  hoverTone,
  as,
  className,
  id,
  role,
  'aria-required': ariaRequired,
  'data-testid': testId,
  style,
  ...rest
}, ref) {
  const Element = (as ?? 'div') as ElementType;

  const classes = [
    backgroundOpacity ? WASH_CLASSES[backgroundOpacity] : TONE_CLASSES[tone],
    BORDER_CLASSES[border],
    BORDER_STYLE_CLASSES[borderStyle],
    hoverTone ? HOVER_TONE_CLASSES[hoverTone] : '',
    RADIUS_CLASSES[radius],
    ELEVATION_CLASSES[elevation],
    PADDING_CLASSES[padding],
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Element
      id={id}
      role={role}
      aria-required={ariaRequired}
      className={classes}
      data-testid={testId}
      style={style}
      ref={ref}
      {...rest}
    >
      {children}
    </Element>
  );
});
