import { MarkdownContent } from './MarkdownContent';
import { Pill } from './Pill';
import {
  JsonTableEditor,
  isJsonTableShape,
} from '../entries/JsonTableEditor';

/**
 * FieldRenderer — read-mode renderer for operational-model fields. Reads a
 * value off `entry.custom_fields[field.key]` (caller passes the value
 * directly) and renders it appropriately for its declared `type`.
 *
 * Field types covered (canonical v1 manifest):
 *   text, number, boolean, date, datetime, markdown, json, select,
 *   multi_select, relation, computed.
 *
 * Write-mode counterpart (form inputs with validation) lands Day 9 with
 * the EntryComposer rework.
 */
export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'markdown'
  | 'json'
  | 'select'
  | 'multi_select'
  | 'relation'
  | 'computed'
  // Plan 03 — Phase 4. ``file`` / ``files`` store attachment ids that
  // reference attachments already bound to the parent entry.
  | 'file'
  | 'files';

export interface FieldDef {
  key: string;
  name: string;
  type: FieldType;
  options?: Array<{ value: string; label?: string; color?: string }>;
  /**
   * When type='file' or 'files', the caller passes a lookup so the
   * renderer can show filenames instead of opaque ids.
   */
  attachmentLabelOf?: (id: string) => string | undefined;
}

interface FieldRendererProps {
  field: FieldDef;
  value: unknown;
  className?: string;
  /** Compact mode: single-line, truncates, suitable for table cells. */
  compact?: boolean;
}

const EMPTY = (
  <span className="text-[var(--text-subtle)] italic">—</span>
);

function formatDate(v: unknown, withTime: boolean): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v as string | number);
  if (isNaN(d.getTime())) return null;
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

/**
 * formatNumberForField — derive a user-friendly number presentation from
 * the field's key. The substrate's number type doesn't carry a
 * presentation hint today (B-ENT-04 from V1 review), so we apply a
 * conservative key-name heuristic: keys that imply currency get a $
 * symbol + thousands separators; keys that imply percent get the % suffix.
 * Everything else falls back to a plain locale-formatted number with
 * thousands separators (today's behaviour).
 *
 * This is a pragmatic patch — a future operational-model manifest version
 * can promote `display.format` to a first-class field property and
 * deprecate this heuristic.
 */
function formatNumberForField(field: FieldDef, n: number): string {
  const k = (field.key || '').toLowerCase();
  if (k.endsWith('_pct') || k.endsWith('_percent') || /(^|_)percent($|_)/u.test(k) || /(^|_)probability($|_)/u.test(k)) {
    // Values are commonly in 0..100 range when stored as percent already,
    // and 0..1 when stored as fraction. Heuristic: if |n| <= 1, treat
    // as fraction; otherwise treat as already-scaled percent.
    const display = Math.abs(n) <= 1 ? n * 100 : n;
    return `${display.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  }
  if (
    k === 'amount' ||
    k === 'value' ||
    k === 'price' ||
    k === 'cost' ||
    k === 'revenue' ||
    k === 'arr' ||
    k === 'mrr' ||
    k === 'acv' ||
    k === 'lifetime_value' ||
    k.endsWith('_value') ||
    k.endsWith('_amount') ||
    k.endsWith('_price') ||
    k.endsWith('_cost') ||
    k.endsWith('_revenue')
  ) {
    return n.toLocaleString(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    });
  }
  return n.toLocaleString();
}

export function FieldRenderer({
  field,
  value,
  className = '',
  compact = false,
}: FieldRendererProps) {
  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0);

  if (isEmpty) return <span className={className}>{EMPTY}</span>;

  switch (field.type) {
    case 'text':
      return (
        <span
          className={`text-[var(--text)] ${compact ? 'truncate inline-block max-w-full' : ''} ${className}`}
        >
          {String(value)}
        </span>
      );

    case 'number': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(n)) return <span className={className}>{EMPTY}</span>;
      const formatted = formatNumberForField(field, n);
      return (
        <span className={`tabular-nums text-[var(--text)] ${className}`}>
          {formatted}
        </span>
      );
    }

    case 'boolean':
      return (
        <Pill
          tone="status"
          variant={value ? 'success' : 'neutral'}
          className={className}
        >
          {value ? 'Yes' : 'No'}
        </Pill>
      );

    case 'date': {
      const f = formatDate(value, false);
      return f ? (
        <span className={`text-[var(--text)] ${className}`}>{f}</span>
      ) : (
        <span className={className}>{EMPTY}</span>
      );
    }

    case 'datetime': {
      const f = formatDate(value, true);
      return f ? (
        <span className={`text-[var(--text)] ${className}`}>{f}</span>
      ) : (
        <span className={className}>{EMPTY}</span>
      );
    }

    case 'markdown':
      if (compact) {
        const text = String(value).replace(/[#*_`>]/g, '').trim();
        return (
          <span
            className={`text-[var(--text-muted)] truncate inline-block max-w-full ${className}`}
          >
            {text}
          </span>
        );
      }
      return (
        <div className={className}>
          <MarkdownContent>{String(value)}</MarkdownContent>
        </div>
      );

    case 'json': {
      // Try parsing string-valued JSON so array-of-objects detection works
      // even when the field is stored as a stringified blob upstream.
      let parsed: unknown = value;
      if (typeof value === 'string') {
        try {
          parsed = JSON.parse(value);
        } catch {
          parsed = value;
        }
      }
      let pretty: string;
      try {
        pretty = JSON.stringify(parsed, null, 2);
      } catch {
        pretty = typeof value === 'string' ? value : JSON.stringify(value);
      }
      if (compact) {
        return (
          <span
            className={`font-mono text-xs text-[var(--text-muted)] truncate inline-block max-w-full ${className}`}
          >
            {pretty.replace(/\s+/g, ' ').trim()}
          </span>
        );
      }
      // Array-of-objects (rubric_lines, line_items, role_effort, …) → render
      // as a read-only table for usability. Falls through to raw <pre> for
      // nested / irregular shapes.
      if (isJsonTableShape(parsed)) {
        return (
          <div className={className}>
            <JsonTableEditor
              value={parsed}
              onChange={() => {
                /* read-only */
              }}
              readonly
            />
          </div>
        );
      }
      return (
        <pre
          className={`font-mono text-xs bg-[var(--panel-2)] border border-[var(--panel-border)] rounded-[var(--radius-input)] p-2 overflow-x-auto whitespace-pre ${className}`}
        >
          {pretty}
        </pre>
      );
    }

    case 'select': {
      const v = String(value);
      const opt = field.options?.find((o) => o.value === v);
      return (
        <Pill tone="descriptive" variant="neutral" className={className}>
          {opt?.label ?? v}
        </Pill>
      );
    }

    case 'multi_select': {
      const arr = Array.isArray(value) ? value : [String(value)];
      return (
        <span className={`inline-flex flex-wrap gap-1 ${className}`}>
          {arr.map((v) => {
            const s = String(v);
            const opt = field.options?.find((o) => o.value === s);
            return (
              <Pill key={s} tone="descriptive" variant="neutral">
                {opt?.label ?? s}
              </Pill>
            );
          })}
        </span>
      );
    }

    case 'relation': {
      return (
        <span
          className={`inline-flex items-center gap-1 text-[var(--text)] ${compact ? 'truncate' : ''} ${className}`}
        >
          <span className="text-[var(--text-subtle)]">↳</span>
          Linked record
        </span>
      );
    }

    case 'computed':
      return (
        <span
          className={`inline-flex items-center gap-1 text-[var(--text-muted)] italic ${compact ? 'truncate' : ''} ${className}`}
          title="Computed field"
        >
          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
        </span>
      );

    case 'file': {
      const id = String(value);
      const label = field.attachmentLabelOf?.(id) || 'Attachment';
      return (
        <span
          className={`inline-flex items-center gap-1 text-[var(--text)] ${compact ? 'truncate' : ''} ${className}`}
          title={label}
        >
          <span className="text-[var(--text-subtle)]">📎</span>
          <span className={compact ? 'truncate' : ''}>{label}</span>
        </span>
      );
    }

    case 'files': {
      const arr = Array.isArray(value) ? value : [value];
      const labels = arr
        .map((v) => String(v))
        .map((id) => field.attachmentLabelOf?.(id) || 'Attachment');
      if (compact) {
        return (
          <span className={`text-[var(--text)] truncate inline-block max-w-full ${className}`}>
            {labels.length === 1
              ? labels[0]
              : `${labels.length} ${labels.length === 1 ? 'file' : 'files'}`}
          </span>
        );
      }
      return (
        <span className={`inline-flex flex-wrap gap-1 ${className}`}>
          {labels.map((label, i) => (
            <Pill key={`${label}-${i}`} tone="descriptive" variant="neutral">
              📎 {label}
            </Pill>
          ))}
        </span>
      );
    }

    default:
      return (
        <span className={`text-[var(--text-muted)] ${className}`}>
          {String(value)}
        </span>
      );
  }
}
