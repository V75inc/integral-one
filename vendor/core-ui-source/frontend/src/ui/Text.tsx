/**
 * Text — typography primitive.
 *
 * Renders text with a semantic variant (role) and tone (color tier).
 * The variant determines font size, line height, weight, and tracking;
 * the tone determines color (mapped to ink tokens). Together they
 * collapse the dozens of literal `text-xs font-medium text-[var(--text-muted)]`
 * combinations found across feature code into a single typed API.
 *
 * See:
 * - `.planning/ui-templating/adr-frontend-layering.md` — five-layer model
 *   (Text is a Layer-1 primitive; consumes only Layer-0 tokens).
 * - `.planning/ui-templating/TOKENS.md` § Typography + § Ink — the
 *   underlying scale and color tiers.
 *
 * **Forbidden:** passing arbitrary Tailwind classes via `className` for
 * size, weight, or color. Use `variant`, `weight`, or `tone` instead.
 * ESLint enforces (Phase 3-A). `className` is reserved for layout
 * positioning (alignment, truncation, max-width caps inside a flex/grid
 * cell, etc.).
 */

import { type ElementType, type ReactNode } from 'react';

/**
 * Semantic typography roles. Each maps to a (size, line-height, weight,
 * tracking) tuple. Pick the role that describes the *meaning* of the
 * text, not its visual weight — display variants are for hero copy,
 * heading variants are for section structure, body for paragraphs,
 * label for form controls, meta for metadata strings.
 */
export type TextVariant =
  | 'display-lg' // page hero — paired with brand surfaces
  | 'display-md' // section hero — feature-page hero rows
  | 'display-sm' // subsection hero — large card titles
  | 'heading-lg' // h1/h2 — page titles
  | 'heading-md' // h3/h4 — section titles
  | 'heading-sm' // h5/h6 — panel headers, dialog titles
  | 'body-lg' // emphasized body copy
  | 'body' // default body (15/22 — `text-sm` in the UI scale)
  | 'body-sm' // secondary body (13/19 — `text-xs` in the UI scale)
  | 'subtitle' // 14/20 — secondary information beneath titles
  | 'meta' // 12/16 — eyebrows, byline timestamps, smallest UI text
  | 'mono' // monospace — code, keys, hashes
  | 'label'; // form labels — `meta`-sized but medium-weight

export type TextTone =
  | 'default' // --text
  | 'muted' // --text-muted
  | 'subtle' // --text-subtle
  | 'brand' // --brand-accent
  | 'info' // --info-fg
  | 'success' // --success-fg
  | 'warn' // --warn-fg
  | 'danger' // --danger-fg
  | 'ai' // --ai-fg
  | 'inherit'; // inherit from parent (useful inside colored surfaces)

export type TextWeight = 'normal' | 'medium' | 'semibold' | 'bold';

/**
 * Variant → utility-class tuple. Single source of truth for the
 * mapping; the Tailwind JIT scanner sees these literals.
 */
const VARIANT_CLASSES: Record<TextVariant, string> = {
  // Display: arbitrary pixel values per design system (independent of the UI scale)
  'display-lg': 'text-[56px] leading-[1.05] tracking-[-0.025em] font-semibold',
  'display-md': 'text-[40px] leading-[1.1] tracking-[-0.02em] font-semibold',
  'display-sm': 'text-[28px] leading-[1.15] tracking-[-0.015em] font-medium',
  // Headings: hierarchy via size + weight + tracking
  'heading-lg': 'text-[22px] leading-[1.2] tracking-[-0.012em] font-medium',
  'heading-md': 'text-[18px] leading-[1.3] tracking-[-0.011em] font-medium',
  'heading-sm': 'text-[15px] leading-[1.35] tracking-[-0.011em] font-medium',
  // Body (UI scale: text-sm = 15/22, text-xs = 13/19)
  'body-lg': 'text-base font-normal',
  body: 'text-sm font-normal',
  'body-sm': 'text-xs font-normal',
  subtitle: 'text-[14px] leading-[20px] font-normal',
  // Meta + label share size; label adds weight
  meta: 'text-[12px] leading-[16px] font-normal',
  label: 'text-[12px] leading-[16px] font-medium tracking-[0.002em]',
  // Mono — uses the system monospace stack via `font-mono` utility
  mono: 'text-xs font-mono',
};

/**
 * Tone → CSS variable wrapped in arbitrary-value text utility. Tailwind
 * JIT picks up the literal strings here. To add a tone, declare the
 * underlying CSS variable in `src/index.css` first (per TOKENS.md
 * "Adding a new token") and add a row here.
 */
const TONE_CLASSES: Record<TextTone, string> = {
  default: 'text-[var(--text)]',
  muted: 'text-[var(--text-muted)]',
  subtle: 'text-[var(--text-subtle)]',
  brand: 'text-[var(--brand-accent)]',
  info: 'text-[var(--info-fg)]',
  success: 'text-[var(--success-fg)]',
  warn: 'text-[var(--warn-fg)]',
  danger: 'text-[var(--danger-fg)]',
  ai: 'text-[var(--ai-fg)]',
  inherit: '',
};

const WEIGHT_CLASSES: Record<TextWeight, string> = {
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
};

export interface TextProps {
  children: ReactNode;
  /** Semantic typography role. */
  variant?: TextVariant;
  /** Color tier. Defaults to `default` (= --text) for headings and body,
   *  `muted` for `meta` and `label`. */
  tone?: TextTone;
  /** Weight override. Leave unset to use the variant's default weight. */
  weight?: TextWeight;
  /** Render element. Default: `span` for body-ish variants, `h2` for
   *  `heading-lg`, etc. — see `defaultElement` in the implementation.
   *  Override when semantic HTML demands a different tag. */
  as?: ElementType;
  /** Truncate to one line with ellipsis. */
  truncate?: boolean;
  /**
   * Layout-positioning classes only (alignment, flex/grid placement,
   * max-width caps inside cells). NEVER size, color, weight, or
   * spacing — those are owned by `variant` / `tone` / `weight` /
   * surrounding `<Stack>`. ESLint enforces (Phase 3-A).
   */
  className?: string;
  /** HTML id (e.g. for `aria-labelledby`). */
  id?: string;
  /** Label association when rendering with `as="label"`. */
  htmlFor?: string;
  /** Optional title attr — tooltip on truncated text. */
  title?: string;
  /** Test hook for meaningful text content. */
  'data-testid'?: string;
}

/**
 * Default element per variant. Headings get semantic tags; body /
 * label / meta stay inline so callers can compose them freely. Override
 * via `as` when needed (e.g. a `body` paragraph wants `<p>`).
 */
function defaultElement(variant: TextVariant): ElementType {
  switch (variant) {
    case 'display-lg':
    case 'heading-lg':
      return 'h2';
    case 'display-md':
    case 'heading-md':
      return 'h3';
    case 'display-sm':
    case 'heading-sm':
      return 'h4';
    case 'label':
      return 'label';
    default:
      return 'span';
  }
}

/**
 * Default tone per variant. Most variants are `default` (= --text);
 * meta and label default to `muted` because that's their canonical
 * usage across the app today.
 */
function defaultTone(variant: TextVariant): TextTone {
  switch (variant) {
    case 'subtitle':
    case 'meta':
    case 'label':
      return 'muted';
    default:
      return 'default';
  }
}

export function Text({
  children,
  variant = 'body',
  tone,
  weight,
  as,
  truncate = false,
  className,
  id,
  htmlFor,
  title,
  'data-testid': testId,
}: TextProps) {
  const Element = (as ?? defaultElement(variant)) as ElementType;
  const resolvedTone = tone ?? defaultTone(variant);

  const classes = [
    VARIANT_CLASSES[variant],
    TONE_CLASSES[resolvedTone],
    weight ? WEIGHT_CLASSES[weight] : '',
    truncate ? 'truncate min-w-0' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Element
      id={id}
      htmlFor={htmlFor}
      title={title}
      className={classes}
      data-testid={testId}
    >
      {children}
    </Element>
  );
}
