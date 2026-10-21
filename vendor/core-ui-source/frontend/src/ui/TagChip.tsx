import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { tagColorStyle } from '../utils/tagColor';

/** Shared, quiet tag treatment for filters, records and selected form values. */
export function TagChip({
  label,
  color,
  selected = false,
  children,
}: {
  label: string;
  color?: string;
  selected?: boolean;
  children?: ReactNode;
}) {
  const colorStyle = tagColorStyle(color);
  return (
    <span
      style={colorStyle}
      className={`inline-flex h-7 max-w-full items-center gap-1.5 rounded-[var(--radius-input)] border border-[var(--border-subtle)] px-2.5 text-xs font-medium leading-none ${colorStyle ? '' : 'bg-[var(--badge-muted-bg)] text-[var(--text)]'} ${selected ? 'ring-1 ring-[var(--text-muted)]' : ''}`}
    >
      {selected ? (
        <Check size={12} aria-hidden className="shrink-0" />
      ) : (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-subtle)]"
          style={colorStyle ? { backgroundColor: color } : undefined}
        />
      )}
      <span className="max-w-56 truncate">{label}</span>
      {children}
    </span>
  );
}
