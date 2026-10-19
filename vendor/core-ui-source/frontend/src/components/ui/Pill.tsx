import type { ReactNode } from 'react';

/**
 * Pill — small status / state indicator.
 *
 * Case rule (per design system spec):
 *   - `tone="status"` (default): renders content UPPERCASE with letter-spacing.
 *     Use for hard states: ACTIVE, ARCHIVED, DRAFT, BLOCKED, OPEN, CLOSED.
 *   - `tone="descriptive"`: renders content as-given (typically Title Case).
 *     Use for descriptive labels: "Sprint planning", "Q4 goals".
 *
 * Variants drive color tokens — no hardcoded palette classes here.
 */
export type PillVariant =
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'ai'
  | 'brand';

export type PillTone = 'status' | 'descriptive';

interface PillProps {
  children: ReactNode;
  variant?: PillVariant;
  tone?: PillTone;
  className?: string;
  /** Optional leading dot — small filled circle in the variant's foreground color. */
  dot?: boolean;
  title?: string;
  /** Override background/color via inline style (e.g. deterministic entry-type colors). */
  style?: React.CSSProperties;
}

const VARIANT_CLASSES: Record<PillVariant, string> = {
  neutral: 'bg-[var(--badge-muted-bg)] text-[var(--badge-muted-fg)]',
  success: 'bg-[var(--success-bg)] text-[var(--success-fg)]',
  warning: 'bg-[var(--warn-bg)] text-[var(--warn-fg)]',
  danger:  'bg-[var(--danger-bg)] text-[var(--danger-fg)]',
  info:    'bg-[var(--info-bg)] text-[var(--info-fg)]',
  ai:      'bg-[var(--ai-bg)] text-[var(--ai-fg)]',
  brand:   'bg-[var(--brand-accent-soft)] text-[var(--brand-accent)]',
};

export function Pill({
  children,
  variant = 'neutral',
  tone = 'status',
  className = '',
  dot = false,
  title,
  style,
}: PillProps) {
  const variantClass = style ? '' : VARIANT_CLASSES[variant];
  const toneClass =
    tone === 'status'
      ? 'uppercase tracking-[0.06em] text-[12.5px] font-semibold'
      : 'text-xs font-medium';

  return (
    <span
      title={title}
      style={style}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 leading-none ${variantClass} ${toneClass} ${className}`}
    >
      {dot && (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: 'currentColor' }}
        />
      )}
      {children}
    </span>
  );
}
