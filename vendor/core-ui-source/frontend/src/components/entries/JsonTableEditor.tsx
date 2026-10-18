/**
 * Phase 37 — table renderer + editor for array-of-objects JSON fields.
 *
 * Detects when a `type: json` field holds an array of plain objects
 * (the common shape for rubric_lines, line_items, role_effort, etc.)
 * and renders it as an editable table instead of raw mono JSON.
 *
 * Cell type inference is row-zero based: if every observed value for
 * a column is numeric or boolean, the cell becomes a typed input;
 * otherwise text. Users can toggle the field into raw JSON mode for
 * full control (nested objects, irregular shapes) — the toggle is
 * available in both editor and reader modes.
 *
 * Reader mode collapses cell controls to read-only `<Text>` values
 * while keeping the same table layout for visual consistency.
 */
import { useMemo, useState } from 'react';
import { Plus, Trash2, Code2, Table as TableIcon } from 'lucide-react';
import { Text } from '../../ui';
import { humanizeFieldKey } from '../../utils/humanizeFieldKey';
import { FieldLabelContent } from './fieldLabel';

const FIELD_INPUT_CLASS =
  'w-full bg-transparent px-2 py-1 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] border-none outline-none';

type RowObject = Record<string, unknown>;
type CellKind = 'number' | 'boolean' | 'text';

export interface JsonTableEditorProps {
  value: unknown;
  onChange: (next: unknown) => void;
  readonly?: boolean;
  /** Field label, shown above the table when truthy. */
  label?: string;
  /** When true, appends a required asterisk to the label. */
  labelRequired?: boolean;
}

/** True when value is `Array<Record<string, primitive | null>>` with ≥1 row. */
export function isJsonTableShape(value: unknown): value is RowObject[] {
  if (!Array.isArray(value)) return false;
  if (value.length === 0) return false;
  return value.every(
    (item) =>
      item !== null &&
      typeof item === 'object' &&
      !Array.isArray(item) &&
      // Reject if any cell is itself a non-primitive container — the
      // table view can't represent nested objects cleanly. Caller
      // falls back to raw JSON.
      Object.values(item as RowObject).every(
        (v) =>
          v == null ||
          typeof v === 'string' ||
          typeof v === 'number' ||
          typeof v === 'boolean',
      ),
  );
}

/** Union of every key across all rows, preserving first-seen order. */
function unionColumns(rows: RowObject[]): string[] {
  const seen = new Set<string>();
  const cols: string[] = [];
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        cols.push(k);
      }
    }
  }
  return cols;
}

/** Infer the dominant cell type for a column across all rows. */
function inferColumnKind(rows: RowObject[], col: string): CellKind {
  let anyNumber = false;
  let anyBool = false;
  let anyOther = false;
  for (const row of rows) {
    const v = row[col];
    if (v == null) continue;
    if (typeof v === 'number') anyNumber = true;
    else if (typeof v === 'boolean') anyBool = true;
    else anyOther = true;
  }
  if (anyOther) return 'text';
  if (anyBool && !anyNumber) return 'boolean';
  if (anyNumber && !anyBool) return 'number';
  return 'text';
}

function coerceCell(raw: string, kind: CellKind): unknown {
  if (raw === '') return null;
  if (kind === 'number') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

function cellToString(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export function JsonTableEditor({
  value,
  onChange,
  readonly = false,
  label,
  labelRequired = false,
}: JsonTableEditorProps) {
  const rows = useMemo(
    () => (Array.isArray(value) ? (value as RowObject[]) : []),
    [value],
  );
  const [rawMode, setRawMode] = useState(false);
  const [rawDraft, setRawDraft] = useState<string>(() =>
    JSON.stringify(value ?? [], null, 2),
  );
  const [rawParseError, setRawParseError] = useState('');

  const columns = useMemo(() => unionColumns(rows), [rows]);
  const columnKinds = useMemo<Record<string, CellKind>>(() => {
    const out: Record<string, CellKind> = {};
    for (const col of columns) out[col] = inferColumnKind(rows, col);
    return out;
  }, [rows, columns]);

  const enterRawMode = () => {
    setRawDraft(JSON.stringify(rows, null, 2));
    setRawParseError('');
    setRawMode(true);
  };

  const exitRawMode = () => {
    try {
      const parsed = JSON.parse(rawDraft || '[]');
      onChange(parsed);
      setRawParseError('');
      setRawMode(false);
    } catch {
      setRawParseError('Invalid JSON — fix syntax before switching to table view.');
    }
  };

  const updateCell = (rowIdx: number, col: string, raw: string) => {
    const next = rows.map((r, i) => {
      if (i !== rowIdx) return r;
      return { ...r, [col]: coerceCell(raw, columnKinds[col] || 'text') };
    });
    onChange(next);
  };

  const toggleBool = (rowIdx: number, col: string) => {
    const next = rows.map((r, i) => {
      if (i !== rowIdx) return r;
      return { ...r, [col]: !r[col] };
    });
    onChange(next);
  };

  const removeRow = (rowIdx: number) => {
    onChange(rows.filter((_, i) => i !== rowIdx));
  };

  const addRow = () => {
    const blank: RowObject = {};
    for (const col of columns) blank[col] = null;
    onChange([...rows, blank]);
  };

  const labelNode = label ? (
    <Text variant="meta" tone="muted" weight="medium">
      <FieldLabelContent name={label} required={labelRequired} />
    </Text>
  ) : null;

  if (rawMode) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2 px-1">
          {labelNode}
          <button
            type="button"
            onClick={exitRawMode}
            className="
              inline-flex items-center gap-1.5
              text-[var(--text-subtle)] hover:text-[var(--text-muted)]
              transition-colors duration-fast
            "
          >
            <TableIcon size={13} strokeWidth={1.5} aria-hidden />
            <Text as="span" variant="meta" tone="inherit">
              Table view
            </Text>
          </button>
        </div>
        <textarea
          value={rawDraft}
          onChange={(e) => {
            setRawDraft(e.target.value);
            if (rawParseError) setRawParseError('');
          }}
          rows={Math.min(20, Math.max(6, rawDraft.split('\n').length))}
          disabled={readonly}
          className="
            w-full font-mono text-xs rounded-[var(--radius-input)]
            border border-[var(--panel-border)]
            bg-[var(--panel)] px-3 py-2
            text-[var(--text)] placeholder:text-[var(--text-muted)]
            focus:outline-none focus:border-[var(--text-muted)]
          "
        />
        {rawParseError ? (
          <Text variant="meta" as="p" className="text-[var(--danger-fg)]">
            {rawParseError}
          </Text>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(label || !readonly || rows.length > 0) && (
        <div className="flex items-center justify-between gap-2 px-1">
          {labelNode}
          <button
            type="button"
            onClick={enterRawMode}
            className="
              inline-flex items-center gap-1.5
              text-[var(--text-subtle)] hover:text-[var(--text-muted)]
              transition-colors duration-fast
            "
          >
            <Code2 size={13} strokeWidth={1.5} aria-hidden />
            <Text as="span" variant="meta" tone="inherit">
              Raw JSON
            </Text>
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div
          className="
            rounded-[var(--radius-card)] border border-dashed
            border-[var(--panel-border)] px-3 py-4 text-center
          "
        >
          <Text variant="meta" tone="subtle">
            No rows yet.
          </Text>
        </div>
      ) : (
        <div
          className="
            overflow-x-auto rounded-[var(--radius-card)] border
            border-[var(--panel-border)]
          "
        >
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--panel-border)]">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="px-3 py-2 text-left align-middle"
                  >
                    <Text as="span" variant="meta" tone="muted" weight="medium">
                      {humanizeFieldKey(col)}
                    </Text>
                  </th>
                ))}
                {!readonly && (
                  <th className="px-2 py-2 w-8" aria-label="Actions" />
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className="border-b border-[var(--border-subtle)] last:border-b-0 group/jsonrow"
                >
                  {columns.map((col) => {
                    const kind = columnKinds[col] || 'text';
                    const cell = row[col];
                    if (kind === 'boolean') {
                      return (
                        <td key={col} className="px-3 py-1.5 align-middle">
                          {readonly ? (
                            <Text variant="body-sm">
                              {cell === true
                                ? 'Yes'
                                : cell === false
                                  ? 'No'
                                  : '—'}
                            </Text>
                          ) : (
                            <input
                              type="checkbox"
                              checked={cell === true}
                              onChange={() => toggleBool(rowIdx, col)}
                              aria-label={`${col} for row ${rowIdx + 1}`}
                            />
                          )}
                        </td>
                      );
                    }
                    if (readonly) {
                      return (
                        <td key={col} className="px-3 py-1.5 align-middle">
                          <Text variant="body-sm">{cellToString(cell)}</Text>
                        </td>
                      );
                    }
                    return (
                      <td key={col} className="px-1 py-0.5 align-middle">
                        <input
                          type={kind === 'number' ? 'number' : 'text'}
                          value={cellToString(cell)}
                          onChange={(e) => updateCell(rowIdx, col, e.target.value)}
                          aria-label={`${col} for row ${rowIdx + 1}`}
                          className={FIELD_INPUT_CLASS}
                        />
                      </td>
                    );
                  })}
                  {!readonly && (
                    <td className="px-2 py-1 align-middle w-8">
                      <button
                        type="button"
                        onClick={() => removeRow(rowIdx)}
                        aria-label={`Remove row ${rowIdx + 1}`}
                        className="
                          inline-flex h-6 w-6 items-center justify-center
                          rounded text-[var(--text-subtle)]
                          hover:text-[var(--danger-fg)]
                          opacity-0 group-hover/jsonrow:opacity-100
                          focus-visible:opacity-100
                          transition-opacity duration-fast
                        "
                      >
                        <Trash2 size={13} strokeWidth={1.5} aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!readonly && (
        <button
          type="button"
          onClick={addRow}
          className="
            inline-flex items-center gap-1.5 px-2 py-1
            text-[var(--text-subtle)] hover:text-[var(--text-muted)]
            transition-colors duration-fast
          "
        >
          <Plus size={13} strokeWidth={1.5} aria-hidden />
          <Text as="span" variant="meta" tone="inherit">
            Add row
          </Text>
        </button>
      )}
    </div>
  );
}
