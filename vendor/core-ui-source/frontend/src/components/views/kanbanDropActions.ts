/**
 * Kanban column drop actions.
 *
 * A column may declare ``on_drop`` instead of accepting a raw group-field
 * write. Apps own the operation, fields, payload, and copy in the Operational
 * Model; Core only hosts the dialog and invokes the App operation.
 */
import type { Entry } from '../../types';
import type {
  KanbanColumnDrop,
  KanbanColumnDropField,
  KanbanColumnDropRequire,
  KanbanColumnSpec,
} from './kanbanColumnUtils';

export interface KanbanDropField {
  key: string;
  label: string;
  type: 'number' | 'text' | 'select';
  source?: string;
  default?: string;
  optional?: boolean;
  options: Array<{ value: string; label: string }>;
}

export interface ResolvedKanbanDrop {
  mode: 'confirm' | 'form';
  operation: string;
  title: string;
  message?: string;
  confirm?: string;
  confirmLabel: string;
  successMessage: string;
  fields: KanbanDropField[];
  payload?: Record<string, unknown>;
  requires: Array<{ path: string; message: string }>;
  /** Stamp ``document_id`` / ``entry_id`` from the card onto the operation input. */
  bindDocument: boolean;
}

export function readKanbanColumn(raw: Record<string, unknown>): KanbanColumnSpec {
  const column: KanbanColumnSpec = {
    key: String(raw.key || '').trim(),
    label: raw.label != null ? String(raw.label) : undefined,
    color: raw.color != null ? String(raw.color) : undefined,
  };
  if (raw.drop_target === false) column.drop_target = false;
  if (Array.isArray(raw.accepts_from)) {
    column.accepts_from = raw.accepts_from.map(item => String(item));
  }
  if (raw.on_drop && typeof raw.on_drop === 'object' && !Array.isArray(raw.on_drop)) {
    column.on_drop = raw.on_drop as KanbanColumnDrop;
  }
  return column;
}

/** Why a card from ``sourceKey`` cannot land on this column, or null when it can. */
export function columnDropBlockReason(
  column: KanbanColumnSpec,
  sourceKey: string,
  sourceLabel: string,
  labelFor: (key: string) => string
): string | null {
  const target = column.label || column.key;
  if (column.drop_target === false) {
    return `${target} updates on its own. Cards can't be dropped here.`;
  }
  const allowed = column.accepts_from;
  if (allowed && allowed.length > 0 && !allowed.includes(sourceKey)) {
    const from = allowed.map(key => labelFor(key)).join(', ');
    return `${target} accepts cards from ${from}. This one is in ${sourceLabel}.`;
  }
  return null;
}

function fieldType(raw: string | undefined): KanbanDropField['type'] {
  if (raw === 'number' || raw === 'select') return raw;
  return 'text';
}

function normalizeFields(raw: KanbanColumnDropField[] | undefined): KanbanDropField[] {
  if (!raw?.length) return [];
  return raw
    .filter(field => field && String(field.key || '').trim())
    .map(field => ({
      key: String(field.key).trim(),
      label: String(field.label || field.key),
      type: fieldType(field.type),
      source: field.source ? String(field.source) : undefined,
      default: field.default != null ? String(field.default) : undefined,
      optional: Boolean(field.optional),
      options: (field.options || [])
        .map(option => {
          if (typeof option === 'string') return { value: option, label: option };
          const value = String(option?.value || '').trim();
          if (!value) return null;
          return { value, label: String(option.label || value) };
        })
        .filter((option): option is { value: string; label: string } => option != null),
    }));
}

function normalizeRequires(
  raw: KanbanColumnDropRequire[] | undefined
): Array<{ path: string; message: string }> {
  if (!raw?.length) return [];
  return raw
    .map(item => {
      const path = String(item?.path || '').trim();
      if (!path) return null;
      const message = String(item.message || `${path} is required.`).trim();
      return { path, message };
    })
    .filter((item): item is { path: string; message: string } => item != null);
}

/** Turn a column ``on_drop`` into something the board can run. */
export function resolveKanbanDrop(
  drop: KanbanColumnDrop | undefined
): ResolvedKanbanDrop | null {
  if (!drop) return null;
  const kind = String(drop.kind || '').trim();
  if (kind && kind !== 'operation') return null;
  const operation = String(drop.operation || '').trim();
  if (!operation) return null;
  const fields = normalizeFields(drop.fields);
  const mode: ResolvedKanbanDrop['mode'] = fields.length > 0 ? 'form' : 'confirm';
  return {
    mode,
    operation,
    title: String(drop.title || 'Update card').trim() || 'Update card',
    message: drop.message != null ? String(drop.message) : undefined,
    confirm: drop.confirm != null ? String(drop.confirm) : undefined,
    confirmLabel: String(drop.confirm_label || 'Continue').trim() || 'Continue',
    successMessage: String(drop.success_message || 'Updated').trim() || 'Updated',
    fields,
    payload: drop.payload,
    requires: normalizeRequires(drop.requires),
    bindDocument: true,
  };
}

function unwrapRelation(value: unknown): unknown {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return unwrapRelation(value[0]);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const id = record.id || record.entry_id;
    if (id != null && String(id).trim()) return String(id).trim();
  }
  return '';
}

function readPath(entry: Entry, path: string): unknown {
  if (path === 'id' || path === 'entry.id') return entry.id;
  if (path === 'title' || path === 'entry.title') return entry.title ?? '';
  const custom = path.startsWith('custom_fields.')
    ? path.slice('custom_fields.'.length)
    : path;
  return unwrapRelation(entry.custom_fields?.[custom]);
}

function resolveToken(
  path: string,
  entry: Entry,
  input: Record<string, string>,
  fields: KanbanDropField[]
): unknown {
  if (path === 'entry.id' || path === 'id') return entry.id;
  if (path === 'entry.title' || path === 'title') return entry.title ?? '';
  if (path.startsWith('input.')) {
    const key = path.slice('input.'.length);
    const raw = input[key] ?? '';
    const field = fields.find(item => item.key === key);
    if (field?.type === 'number') {
      const amount = Number(raw);
      return Number.isFinite(amount) ? amount : '';
    }
    return raw;
  }
  if (path.startsWith('custom_fields.')) return readPath(entry, path);
  return '';
}

function resolveTemplate(
  value: unknown,
  entry: Entry,
  input: Record<string, string>,
  fields: KanbanDropField[]
): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\$([A-Za-z0-9_.]+)$/);
    if (exact) return resolveToken(exact[1], entry, input, fields);
    if (!value.includes('$')) return value;
    return value.replace(/\$([A-Za-z0-9_.]+)/g, (_match, path: string) =>
      String(resolveToken(path, entry, input, fields) ?? '')
    );
  }
  if (Array.isArray(value)) {
    return value.map(item => resolveTemplate(item, entry, input, fields));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const next = resolveTemplate(child, entry, input, fields);
      if (next === '' || next == null) continue;
      out[key] = next;
    }
    return out;
  }
  return value;
}

export function initialDropFieldValues(
  fields: KanbanDropField[],
  entry: Entry
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    if (field.source) {
      const raw = readPath(entry, field.source);
      values[field.key] =
        raw == null || raw === '' ? '' : String(raw);
    } else {
      values[field.key] = field.default ?? '';
    }
  }
  return values;
}

export function buildDropPayload(
  template: Record<string, unknown> | undefined,
  entry: Entry,
  input: Record<string, string>,
  fields: KanbanDropField[]
): Record<string, unknown> {
  const resolved = resolveTemplate(template ?? {}, entry, input, fields);
  if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) return {};
  return resolved as Record<string, unknown>;
}

/** Client-side checks before a form drop is sent. Null means the input is usable. */
export function validateDropInput(
  action: ResolvedKanbanDrop,
  entry: Entry,
  input: Record<string, string>
): string | null {
  for (const requirement of action.requires) {
    const value = readPath(entry, requirement.path);
    if (value == null || String(value).trim() === '') {
      return requirement.message;
    }
  }
  for (const field of action.fields) {
    const raw = input[field.key] ?? '';
    if (!field.optional && String(raw).trim() === '') {
      return `Enter ${field.label.toLowerCase()}.`;
    }
    if (field.type !== 'number') continue;
    if (field.optional && String(raw).trim() === '') continue;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      return `Enter ${field.label.toLowerCase()} greater than zero.`;
    }
    if (!field.source) continue;
    const balance = Number(readPath(entry, field.source));
    if (!Number.isFinite(balance)) continue;
    if (balance <= 0) return 'There is no open balance to collect.';
    if (amount > balance + 1e-9) {
      return `Amount exceeds the open balance (${balance}).`;
    }
  }
  return null;
}

export function dropOperationError(output: unknown): string | null {
  if (!output || typeof output !== 'object') return null;
  const record = output as Record<string, unknown>;
  if (record.error || record.error_code) {
    return String(record.message || record.error_code || 'The action failed');
  }
  return null;
}
