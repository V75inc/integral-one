import { X } from 'lucide-react';
import type { FieldFilter } from '../tracks/fieldFilters';
import { describeColumnFilter, onField, withoutField, type ColumnFilterSpec } from './columnFilterModel';

/** The active column filters as removable chips, with the result count and Clear all. */
export function FilterChips({
  specs, filters, onChange, total, onEdit,
}: { specs: ColumnFilterSpec[]; filters: FieldFilter[]; onChange(next: FieldFilter[]): void; total?: number; onEdit?(field: string, anchor: HTMLElement): void }) {
  const active = specs.filter(s => onField(filters, s.field).length > 0);
  if (!active.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-[var(--entry-table-divider)] px-3 py-2 md:px-4" role="group" aria-label="Active filters">
      {active.map(spec => (
        <span key={spec.field} className="inline-flex items-center gap-1 rounded-full border border-[var(--panel-border)] bg-[var(--nav-active-bg)] py-0.5 pl-2.5 pr-1 text-xs text-[var(--nav-active-fg)]">
          <button type="button" className="hover:underline" onClick={e => onEdit?.(spec.field, e.currentTarget)}>{describeColumnFilter(spec, onField(filters, spec.field))}</button>
          <button type="button" aria-label={`Remove filter ${spec.label}`} onClick={() => onChange(withoutField(filters, spec.field))}
            className="rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"><X size={12} aria-hidden /></button>
        </span>
      ))}
      <button type="button" className="text-xs text-[var(--link)] hover:underline" onClick={() => onChange([])}>Clear all</button>
      {total !== undefined && <span className="ml-auto text-xs tabular-nums text-[var(--text-muted)]">{total.toLocaleString()} {total === 1 ? 'result' : 'results'}</span>}
    </div>
  );
}
