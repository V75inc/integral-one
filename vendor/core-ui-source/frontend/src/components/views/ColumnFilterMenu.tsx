import { useState } from 'react';
import { Button } from '../ui/Button';
import { FacetList } from './FacetList';
import { filterValue, withFilter, type FieldFilter } from '../tracks/fieldFilters';
import { DATE_PRESETS, endOfDay, onField, optionLabel, withoutField, type ColumnFilterSpec } from './columnFilterModel';

/**
 * The menu behind a column's filter button. What it offers follows the column: text (contains or exact), a number
 * range, a date range with common presets, a checkbox list for choices, and Yes/No. Nothing is sent until Apply
 * (presets, choices and Yes/No apply as soon as they are picked).
 */

const field = 'h-9 w-full min-w-0 rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] px-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text-muted)]';
const label = 'mb-1 block text-xs text-[var(--text-muted)]';
const day = (v: unknown) => String(v ?? '').slice(0, 10);
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));

export function ColumnFilterMenu({
  spec, filters, onChange, onClose,
}: { spec: ColumnFilterSpec; filters: FieldFilter[]; onChange(next: FieldFilter[]): void; onClose(): void }) {
  const mine = onField(filters, spec.field);
  const rest = withoutField(filters, spec.field);
  const pickedBefore = (filterValue(filters, spec.field, 'in') as unknown[] | undefined)?.map(String) ?? [];
  const [mode, setMode] = useState<'pick' | 'type'>(spec.kind === 'text' && pickedBefore.length === 0 && filterValue(filters, spec.field, 'contains') !== undefined ? 'type' : 'pick');
  const [exact, setExact] = useState(filterValue(filters, spec.field, 'eq') !== undefined && spec.kind === 'text');
  const [text, setText] = useState(str(filterValue(filters, spec.field, exact ? 'eq' : 'contains')));
  const [min, setMin] = useState(str(filterValue(filters, spec.field, 'gte')));
  const [max, setMax] = useState(str(filterValue(filters, spec.field, 'lte')));
  const [from, setFrom] = useState(day(filterValue(filters, spec.field, 'gte')));
  const [to, setTo] = useState(day(filterValue(filters, spec.field, 'lte')));
  const chosen = ((filterValue(filters, spec.field, 'in') as unknown[]) ?? []).map(String);

  const set = (next: FieldFilter[]) => onChange(next);
  const pick = (values: string[], labels: Record<string, string>) =>
    set(values.length ? [...rest, { field: spec.field, op: 'in', value: values, labels }] : rest);
  const apply = () => {
    let next = rest;
    const add = (op: string, value: unknown) => { next = withFilter(next, spec.field, op, value); };
    if (spec.kind === 'text') add(exact ? 'eq' : 'contains', text.trim());
    if (spec.kind === 'text') next = next.filter(f => !(f.field === spec.field && f.op === 'in'));
    if (spec.kind === 'number') {
      add('gte', min.trim() === '' || !Number.isFinite(Number(min)) ? undefined : Number(min));
      add('lte', max.trim() === '' || !Number.isFinite(Number(max)) ? undefined : Number(max));
    }
    if (spec.kind === 'date' || spec.kind === 'datetime') { add('gte', from); add('lte', endOfDay(spec.kind, to)); }
    set(next);
    onClose();
  };
  const clear = () => { set(rest); onClose(); };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };

  return (
    <div className="space-y-3" onKeyDown={onEnter}>
      <p className="text-sm font-semibold text-[var(--text)]">{spec.label}</p>

      {spec.kind === 'text' && (
        <div className="space-y-2">
          <div className="flex gap-1.5" role="group" aria-label="How to filter">
            {([['pick', 'Pick values'], ['type', 'Type to match']] as const).map(([m, name]) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
                className={`rounded-full border px-3 py-1 text-xs ${mode === m ? 'border-[var(--panel-border)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]' : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--panel-2)]'}`}>{name}</button>
            ))}
          </div>
          {mode === 'pick' ? (
            <FacetList spec={spec} otherFilters={rest} selected={pickedBefore} labelsOf={{}} onChange={pick} />
          ) : (
            <div className="space-y-2">
              <div className="flex gap-1.5" role="group" aria-label="Match">
                {[[false, 'Contains'], [true, 'Is exactly']].map(([isExact, name]) => (
                  <button key={String(name)} type="button" aria-pressed={exact === isExact} onClick={() => setExact(Boolean(isExact))}
                    className={`rounded-full border px-3 py-1 text-xs ${exact === isExact ? 'border-[var(--panel-border)] bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]' : 'border-transparent text-[var(--text-muted)] hover:bg-[var(--panel-2)]'}`}>{String(name)}</button>
                ))}
              </div>
              <input autoFocus className={field} aria-label={`${spec.label} value`} placeholder="Type to filter…" value={text} onChange={e => setText(e.target.value)} />
            </div>
          )}
        </div>
      )}

      {spec.kind === 'relation' && (
        <FacetList spec={spec} otherFilters={rest} selected={pickedBefore}
          labelsOf={(filters.find(f => f.field === spec.field && f.op === 'in')?.labels) ?? {}} onChange={pick} />
      )}

      {spec.kind === 'number' && (
        <div className="grid grid-cols-2 gap-2">
          <div><span className={label}>At least</span><input autoFocus type="number" className={field} aria-label={`${spec.label} at least`} value={min} onChange={e => setMin(e.target.value)} /></div>
          <div><span className={label}>At most</span><input type="number" className={field} aria-label={`${spec.label} at most`} value={max} onChange={e => setMax(e.target.value)} /></div>
        </div>
      )}

      {(spec.kind === 'date' || spec.kind === 'datetime') && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick ranges">
            {DATE_PRESETS.map(p => (
              <button key={p.key} type="button"
                className="rounded-full border border-[var(--panel-border)] px-2.5 py-1 text-xs text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
                onClick={() => { const [a, b] = p.range(new Date()); set(withFilter(withFilter(rest, spec.field, 'gte', a), spec.field, 'lte', endOfDay(spec.kind, b))); onClose(); }}>{p.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><span className={label}>From</span><input type="date" className={field} aria-label={`${spec.label} from`} value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><span className={label}>To</span><input type="date" className={field} aria-label={`${spec.label} to`} value={to} onChange={e => setTo(e.target.value)} /></div>
          </div>
        </div>
      )}

      {spec.kind === 'select' && (
        <ul className="max-h-56 space-y-0.5 overflow-auto" aria-label={`${spec.label} choices`}>
          {spec.options.map(o => {
            const on = chosen.includes(o);
            return (
              <li key={o}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-input)] px-1.5 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--panel-2)]">
                  <input type="checkbox" checked={on} onChange={() => set(withFilter(rest, spec.field, 'in', on ? chosen.filter(v => v !== o) : [...chosen, o]).filter(f => !(f.op === 'in' && Array.isArray(f.value) && f.value.length === 0)))} />
                  {optionLabel(spec, o)}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {spec.kind === 'boolean' && (
        <div className="flex gap-1.5" role="group" aria-label={`${spec.label} is`}>
          {[['Yes', true], ['No', false]].map(([name, value]) => (
            <button key={String(name)} type="button" onClick={() => { set(withFilter(rest, spec.field, 'eq', value)); onClose(); }}
              className="rounded-full border border-[var(--panel-border)] px-3 py-1 text-sm text-[var(--text)] hover:bg-[var(--panel-2)]">{String(name)}</button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={clear} disabled={!mine.length}>Clear</Button>
        {(spec.kind === 'text' && mode === 'type') || ['number', 'date', 'datetime'].includes(spec.kind) ? <Button variant="primary" size="sm" onClick={apply}>Apply</Button> : <Button variant="outline" size="sm" onClick={onClose}>Done</Button>}
      </div>
    </div>
  );
}
