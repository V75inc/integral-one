import type { ReactNode } from 'react';

/**
 * SegmentedControl — pill-shaped multi-option selector. One value is always
 * active. Use for small bounded sets (2–5 options). For larger sets, prefer
 * Select / Dropdown.
 *
 * The active segment uses `--cta-bg` / `--cta-fg` for max contrast against
 * the muted track. Inactive segments fade their label to `--text-muted`.
 */
export interface SegmentOption<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Optional left-side adornment (icon, dot, etc.). */
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<V extends string = string> {
  options: SegmentOption<V>[];
  value: V;
  onChange: (next: V) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<V extends string = string>({
  options,
  value,
  onChange,
  size = 'md',
  className = '',
  ariaLabel,
}: SegmentedControlProps<V>) {
  const padding = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm';
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 rounded-[var(--radius-pill)] bg-[var(--panel-2)] p-0.5 border border-[var(--panel-border)] ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={o.disabled}
            title={o.title}
            onClick={() => !o.disabled && onChange(o.value)}
            className={[
              'inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] font-medium leading-none',
              'transition-[background-color,color] duration-fast',
              padding,
              active
                ? 'bg-[var(--cta-bg)] text-[var(--cta-fg)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]',
              o.disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
            ].join(' ')}
          >
            {o.icon && <span aria-hidden>{o.icon}</span>}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
