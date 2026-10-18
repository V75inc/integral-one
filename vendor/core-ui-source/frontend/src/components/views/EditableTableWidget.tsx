import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { SeamlessField } from '../entries/SeamlessField';
import type { RelationChoice } from '../entries/EntryFormExpanded';
import { slug } from '../entries/entryFormCustomFields';
import { entriesApi, entryTypesApi, tracksApi } from '../../api';
import { useToast } from '../../context/ToastContext';
import { Surface } from '../../ui/Surface';
import { Text } from '../../ui/Text';
import { fieldEntryKey, fieldEntryVisibleIf, isVisible, type ConditionalFieldEntry } from './regionConditions';
import type { ViewWidgetProps } from './types';
import type { OperationalModelFieldSpec, Entry, EntryTypeNode } from '../../types';

/**
 * Spreadsheet-style inline-editable grid over a track's entries — add/edit/
 * remove rows without leaving the page. Reuses ``SeamlessField`` (the same
 * per-field-type dispatch the entry composer uses) for every editable cell,
 * so text/number/boolean/select/relation columns all render with their
 * normal editors — no new cell-editor code per field type.
 *
 * Built self-sufficient rather than relying on ``ViewWidgetProps``'
 * ``onEntryCreate``/``onEntryDelete``/``fields``/``entryTypes``: when
 * embedded via an entry's ``related_views`` (the Anchor Pattern path this
 * widget is designed for), ``ComposableViewSlot`` does not forward those —
 * it only wires ``entries``, ``view``, ``isLoading``, and a no-op
 * ``onEntryOpen`` for the related-view-embed case. This widget fetches its
 * own entry-type field spec and drives create/update/delete directly
 * against the entries API, which also makes it correct when used as an
 * ordinary top-level track view (where those props ARE supplied — it simply
 * doesn't need them there either).
 *
 * ``columns`` (``view.config.columns``) accepts ``ConditionalFieldEntry[]``
 * — a bare key (always shown) or ``{key, visible_if: {field, equals}}`` to
 * gate a whole COLUMN on a field that lives on the PARENT/host entry (e.g.
 * NIS's Wages Period 2-5 columns only shown when the filing's
 * ``schedule_type`` is "Weekly", Period 1 always shown) — not on each row's
 * own fields, since a value like schedule_type is set once on the filing,
 * not per employee line. Same condition shape as FormRegionWidget's
 * per-field gate and LayoutContainerWidget's per-region gate — see
 * ``regionConditions.ts``.
 */
export function EditableTableWidget({ entries, view, isLoading }: ViewWidgetProps) {
  const { showToast } = useToast();
  const [entryTypes, setEntryTypes] = useState<EntryTypeNode[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [rows, setRows] = useState<Entry[]>(entries);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => setRows(entries), [entries]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTypes(true);
    entryTypesApi
      .list({ track_id: view.track_id })
      .then(types => {
        if (!cancelled) setEntryTypes(types);
      })
      .catch(() => {
        if (!cancelled) setEntryTypes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTypes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view.track_id]);

  const activeEntryType = useMemo<EntryTypeNode | undefined>(() => {
    if (!entryTypes.length) return undefined;
    const wantKey = view.default_entry_type_key;
    if (wantKey) {
      const byManifestKey = entryTypes.find(
        et => et.form_schema?._manifest_entry_type_key === wantKey
      );
      if (byManifestKey) return byManifestKey;
    }
    return entryTypes[0];
  }, [entryTypes, view.default_entry_type_key]);

  const fields = useMemo<OperationalModelFieldSpec[]>(
    () => activeEntryType?.form_schema?.fields ?? [],
    [activeEntryType]
  );

  const fieldByKey = useMemo(() => {
    const out = new Map<string, OperationalModelFieldSpec>();
    for (const f of fields) out.set(f.key, f);
    return out;
  }, [fields]);

  const config = (view.config || {}) as Record<string, unknown>;
  const bindings = (config.__bindings || {}) as Record<string, unknown>;
  const hostEntryId = typeof bindings.entryId === 'string' ? bindings.entryId : undefined;

  // The parent filing (e.g. nis_schedule), not any one row — needed to
  // evaluate a column's visible_if against a field that lives on the
  // PARENT, not each line (schedule_type: "Weekly" vs "Monthly" decides
  // whether Wages Period 2-5 columns show at all; each row doesn't carry
  // its own copy of that field). Fetched once, independent of `entries`/
  // `rows` (the row list), same "don't trust a possibly-stale prop, fetch
  // directly" convention FormRegionWidget's 'self' bind mode already uses.
  const [hostEntry, setHostEntry] = useState<Entry | null>(null);
  useEffect(() => {
    if (!hostEntryId) {
      setHostEntry(null);
      return;
    }
    let cancelled = false;
    entriesApi
      .get(hostEntryId)
      .then(e => {
        if (!cancelled) setHostEntry(e);
      })
      .catch(() => {
        if (!cancelled) setHostEntry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [hostEntryId]);

  const columnEntries = useMemo<ConditionalFieldEntry[]>(() => {
    const explicit = config.columns as ConditionalFieldEntry[] | undefined;
    if (explicit && explicit.length) return explicit;
    return fields.map(f => f.key);
  }, [config.columns, fields]);
  const hostValues = hostEntry?.custom_fields as Record<string, unknown> | undefined;
  const columnKeys = useMemo<string[]>(
    () =>
      columnEntries
        .filter(entry => isVisible(fieldEntryVisibleIf(entry), hostValues))
        .map(fieldEntryKey),
    [columnEntries, hostValues]
  );

  // ── Resizable columns ────────────────────────────────────────────────
  // Wide identity/name fields (e.g. "Surname", "First Name") and narrow
  // number fields ("Over 60?", wage amounts) don't need the same width, and
  // a fixed width per field type is still occasionally wrong for real
  // content — a table with 15-20+ columns (PAYE's line table) needs actual
  // per-column control, not just a wider minimum. Widths are pixel-precise,
  // stored per column key, dragged from a handle on each header cell's
  // right edge; unset columns fall back to a per-field-type default sized
  // for typical content (numbers/booleans narrow, names/text wider).
  const defaultColumnWidth = useCallback((key: string): number => {
    const field = fieldByKey.get(key);
    if (!field) return 140;
    if (field.type === 'boolean') return 90;
    if (field.type === 'number' || field.type === 'date') return 110;
    if (field.type === 'relation') return 180;
    return 150;
  }, [fieldByKey]);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const startResize = useCallback(
    (key: string, e: ReactMouseEvent) => {
      e.preventDefault();
      resizingRef.current = {
        key,
        startX: e.clientX,
        startWidth: columnWidths[key] ?? defaultColumnWidth(key),
      };
      const onMove = (moveEvent: MouseEvent) => {
        const active = resizingRef.current;
        if (!active) return;
        const next = Math.max(64, active.startWidth + (moveEvent.clientX - active.startX));
        setColumnWidths(prev => ({ ...prev, [active.key]: next }));
      };
      const onUp = () => {
        resizingRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [columnWidths, defaultColumnWidth]
  );

  // SeamlessField's relation-type cells render whatever ``relationChoices``
  // they're handed — it does no fetching of its own (see
  // EntryFormExpanded.tsx, the only other caller, which does this same
  // fetch). Without it every relation column (e.g. this app's "Employee"
  // column, a cross-track relation into hr_app's Employees track) opens an
  // empty, permanently-loading picker with zero options. Trimmed port of
  // EntryFormExpanded's relation-choices effect: resolve candidate tracks
  // by ``target_track_types``, fetch their entries, filter by
  // ``target_entry_types``.
  const [relationChoices, setRelationChoices] = useState<
    Record<string, RelationChoice[]>
  >({});
  const [relationLoading, setRelationLoading] = useState(false);
  const relationFieldsFetchSig = fields
    .filter(f => f.type === 'relation')
    .map(f => `${f.key}:${JSON.stringify(f.relation ?? {})}`)
    .join('\x1e');

  useEffect(() => {
    const relationFields = fields.filter(f => f.type === 'relation');
    if (!relationFields.length) {
      setRelationChoices(prev => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    let cancelled = false;
    setRelationLoading(true);
    (async () => {
      try {
        const allTracks = await tracksApi.list();
        const choicesByField: Record<string, RelationChoice[]> = {};
        await Promise.all(
          relationFields.map(async relField => {
            const relation = relField.relation || {};
            const allowCrossTrack = Boolean(relation.allow_cross_track);
            const targetEntryTypes = new Set(
              (relation.target_entry_types || []).map(x => slug(String(x)))
            );
            const targetTrackTypes = new Set(
              (relation.target_track_types || []).map(x => slug(String(x)))
            );
            const candidateTracks = allowCrossTrack
              ? allTracks.filter(t => {
                  if (!targetTrackTypes.size) return true;
                  const typeKey = slug(String(t.template_id || t.relation_type_key || t.title));
                  return targetTrackTypes.has(typeKey);
                })
              : allTracks.filter(t => t.id === view.track_id);
            const entryLists = await Promise.all(
              candidateTracks.map(async t => {
                try {
                  const es = await entriesApi.list({ track_id: t.id, limit: 200 });
                  return { track: t, entries: es };
                } catch {
                  return { track: t, entries: [] };
                }
              })
            );
            const deduped = new Map<string, RelationChoice>();
            for (const group of entryLists) {
              for (const item of group.entries) {
                if (
                  targetEntryTypes.size &&
                  !targetEntryTypes.has(slug(String(item.type)))
                ) {
                  continue;
                }
                const primary =
                  String(item.title || '').trim() ||
                  String(item.body || '').trim().slice(0, 80) ||
                  `Entry ${item.id.slice(-6)}`;
                deduped.set(item.id, {
                  value: item.id,
                  label: `${primary} (${group.track.title})`,
                });
              }
            }
            choicesByField[relField.key] = Array.from(deduped.values());
          })
        );
        if (!cancelled) setRelationChoices(choicesByField);
      } finally {
        if (!cancelled) setRelationLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relationFieldsFetchSig, view.track_id]);

  const commitCell = useCallback(
    async (entry: Entry, key: string, value: unknown) => {
      const cellId = `${entry.id}:${key}`;
      setSavingCell(cellId);
      // Optimistic local update so typing feels immediate.
      setRows(prev =>
        prev.map(r =>
          r.id === entry.id
            ? { ...r, custom_fields: { ...(r.custom_fields || {}), [key]: value } }
            : r
        )
      );
      try {
        const updated = await entriesApi.update(entry.id, {
          custom_fields: { [key]: value },
        });
        setRows(prev => prev.map(r => (r.id === entry.id ? updated : r)));
      } catch {
        showToast('Failed to save cell', 'error');
        setRows(entries);
      } finally {
        setSavingCell(null);
      }
    },
    [entries, showToast]
  );

  // App-specific field mirroring belongs in server-side entry hooks so it
  // applies consistently across save surfaces.

  const addRow = useCallback(async () => {
    if (!activeEntryType) return;
    setCreating(true);
    try {
      const created = await entriesApi.create({
        track_id: view.track_id,
        type: activeEntryType.form_schema?._manifest_entry_type_key || activeEntryType.name,
        type_id: activeEntryType.id,
        title: '',
        custom_fields: {},
      });
      setRows(prev => [...prev, created]);
    } catch {
      showToast('Failed to add row', 'error');
    } finally {
      setCreating(false);
    }
  }, [activeEntryType, showToast, view.track_id]);

  const deleteRow = useCallback(
    async (entry: Entry) => {
      const prev = rows;
      setRows(r => r.filter(x => x.id !== entry.id));
      try {
        await entriesApi.delete(entry.id);
      } catch {
        showToast('Failed to remove row', 'error');
        setRows(prev);
      }
    },
    [rows, showToast]
  );

  if (isLoading || loadingTypes) {
    return (
      <Surface
        tone="panel-2"
        border="none"
        radius="input"
        className="h-24 animate-pulse"
      />
    );
  }

  return (
    <Surface data-testid="editable-table-widget" tone="panel" border="entry-table" radius="card" elevation="card" className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="text-sm" style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <colgroup>
            {columnKeys.map(key => (
              <col key={key} style={{ width: `${columnWidths[key] ?? defaultColumnWidth(key)}px` }} />
            ))}
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr className="border-b border-[var(--entry-table-border)] bg-[var(--entry-table-header)]">
              {columnKeys.map(key => (
                <th
                  key={key}
                  className="relative text-left px-3 py-2 overflow-hidden"
                >
                  <Text variant="meta" weight="semibold" tone="muted" className="block truncate" title={fieldByKey.get(key)?.name || key}>
                    {fieldByKey.get(key)?.name || key}
                  </Text>
                  {/* Drag handle — resizes this column; "dynamic lengths" per
                      the actual ask, not just a wider fixed minimum. */}
                  <div
                    onMouseDown={e => startResize(key, e)}
                    className="absolute top-0 right-0 h-full w-2 cursor-col-resize select-none hover:bg-[var(--link)]/30 active:bg-[var(--link)]/50"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${fieldByKey.get(key)?.name || key} column`}
                  />
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id} className={`border-b border-[var(--entry-table-divider)] last:border-b-0 hover:bg-[var(--entry-table-row-hover)] ${index % 2 === 0 ? '' : 'bg-[var(--entry-table-row-alt)]'}`}>
                {columnKeys.map(key => {
                  const field = fieldByKey.get(key);
                  const value = (row.custom_fields || {})[key];
                  if (!field || field.type === 'computed' || field.readonly) {
                    return (
                      <td key={key} className="px-3 py-2">
                        <Text variant="body-sm" tone="muted">
                          {value === undefined || value === null || value === ''
                            ? '—'
                            : String(value)}
                        </Text>
                      </td>
                    );
                  }
                  const cellId = `${row.id}:${key}`;
                  return (
                    <td
                      key={key}
                      className={`px-1 py-1 align-top ${
                        savingCell === cellId ? 'opacity-60' : ''
                      }`}
                    >
                      <SeamlessField
                        field={field}
                        value={value}
                        onChange={next => commitCell(row, key, next)}
                        entryId={row.id}
                        relationChoices={relationChoices[key]}
                        relationLoading={relationLoading}
                      />
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => deleteRow(row)}
                    className="rounded-[var(--radius-input)] p-1 transition-colors hover:bg-[var(--entry-table-row-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--text)]"
                    aria-label="Remove row"
                  >
                    <Text as="span" variant="body-sm" tone="muted" className="inline-flex">
                      <Trash2 size={14} strokeWidth={1.5} />
                    </Text>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div className="p-6 text-center">
          <Text variant="body-sm" tone="muted">No rows yet.</Text>
        </div>
      )}
      <div className="border-t border-[var(--entry-table-border)] bg-[var(--entry-table-toolbar)] px-3 py-2">
        <button
          type="button"
          onClick={addRow}
          disabled={creating || !activeEntryType}
          className="rounded-[var(--radius-input)] px-2 py-1 transition-colors hover:bg-[var(--entry-table-row-hover)] disabled:opacity-50"
        >
          <Text variant="body-sm" weight="medium" tone="muted" className="inline-flex items-center gap-1.5">
            <Plus size={13} strokeWidth={1.5} />
            Add row
          </Text>
        </button>
      </div>
    </Surface>
  );
}
