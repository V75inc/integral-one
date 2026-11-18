import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { tracksApi } from '../../api';
import { loadRelationTarget } from '../entries/relations/relationTargetLoader';
import type { FieldFilter } from '../tracks/fieldFilters';
import type { ColumnFilterSpec } from './columnFilterModel';

/**
 * A pick-list of the values a column really holds, with how many records have each: tick one or several instead
 * of typing. Text columns list their values; link columns list the linked records by name. The counts follow the
 * other active filters, and the list is searchable once it is long.
 */

// The most common values, fetched once per menu (and per change to the other filters) and searched in the browser,
// so typing in the search box never goes back to the server.
const MAX_SHOWN = 200;

export function FacetList({
  spec, otherFilters, selected, labelsOf, onChange,
}: {
  spec: ColumnFilterSpec;
  /** Every active filter except this column's own. */
  otherFilters: FieldFilter[];
  selected: string[];
  labelsOf: Record<string, string>;
  onChange(values: string[], labels: Record<string, string>): void;
}) {
  const [search, setSearch] = useState('');
  const debounced = search.trim();
  const isRelation = spec.kind === 'relation';
  const filtersKey = JSON.stringify(otherFilters.map(({ field, op, value }) => ({ field, op, value })));

  const facets = useQuery({
    queryKey: ['facets', spec.trackId, spec.field, filtersKey],
    enabled: Boolean(spec.trackId),
    staleTime: 30_000,
    queryFn: () => tracksApi.getFacets(spec.trackId!, spec.field, {
      limit: MAX_SHOWN,
      filters: otherFilters.map(({ field, op, value }) => ({ field, op, value })),
    }),
  });

  // Linked records are shown by name: ids are resolved once, in one batch, and only for the ones listed.
  const ids = useMemo(() => (isRelation ? (facets.data?.values ?? []).map(v => String(v.value)) : []), [isRelation, facets.data]);
  const names = useQuery({
    queryKey: ['facet-names', ids.join(',')],
    enabled: isRelation && ids.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const found = await Promise.all(ids.map(async id => [id, (await loadRelationTarget('entry', id))?.title?.trim() || ''] as const));
      return Object.fromEntries(found.filter(([, name]) => name));
    },
  });
  const nameOf = (value: string) => (isRelation ? names.data?.[value] ?? labelsOf[value] ?? '…' : value);

  const rows = useMemo(() => {
    const all = (facets.data?.values ?? []).map(v => ({ value: String(v.value), count: v.count }));
    const needle = debounced.toLowerCase();
    return needle ? all.filter(r => nameOf(r.value).toLowerCase().includes(needle)) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facets.data, debounced, isRelation, names.data]);

  const toggle = (value: string) => {
    const next = selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value];
    const labels: Record<string, string> = {};
    for (const v of next) labels[v] = nameOf(v) === '…' ? labelsOf[v] ?? '' : nameOf(v);
    onChange(next, labels);
  };

  return (
    <div className="space-y-2">
      <input
        className="h-9 w-full min-w-0 rounded-[var(--radius-input)] border border-[var(--panel-border)] bg-[var(--panel-2)] px-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text-muted)]"
        placeholder={`Search ${spec.label.toLowerCase()}…`}
        aria-label={`Search ${spec.label}`}
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      {facets.isLoading ? (
        <p className="py-3 text-center text-xs text-[var(--text-muted)]" role="status">Loading…</p>
      ) : facets.isError ? (
        <p className="py-3 text-center text-xs text-[var(--danger-fg)]" role="alert">The values could not be loaded.</p>
      ) : rows.length === 0 ? (
        <p className="py-3 text-center text-xs text-[var(--text-muted)]">Nothing matches.</p>
      ) : (
        <ul className="max-h-56 space-y-0.5 overflow-auto" aria-label={`${spec.label} values`}>
          {rows.map(r => (
            <li key={r.value}>
              <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-input)] px-1.5 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--panel-2)]">
                <input type="checkbox" checked={selected.includes(r.value)} onChange={() => toggle(r.value)} />
                <span className="min-w-0 flex-1 truncate" title={nameOf(r.value)}>{nameOf(r.value)}</span>
                <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">{r.count.toLocaleString()}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {facets.data?.truncated ? <p className="text-xs text-[var(--text-muted)]">Counted from the first 20,000 records.</p> : null}
      {(facets.data?.distinct ?? 0) > MAX_SHOWN ? <p className="text-xs text-[var(--text-muted)]">Showing the {MAX_SHOWN} most common of {facets.data!.distinct.toLocaleString()}.{isRelation ? '' : ' Use Type to match for the rest.'}</p> : null}
    </div>
  );
}
