import { format, parseISO, isValid } from 'date-fns';
import type { OperationalModelFieldSpec } from '../types';
import { humanizeEnumValue } from './humanizeFieldKey';

export function slugEntryTypeName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Numeric sort key for a profile field (missing/invalid → sort last, stable by index). */
export function fieldOrderSortKey(
  field: OperationalModelFieldSpec,
  fallbackIndex: number
): number {
  const raw = field.order as number | string | undefined;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  // Preserve manifest/array order when ``order`` was never authored.
  return 1_000_000 + fallbackIndex;
}

export function sortFieldsByOrder(fields: OperationalModelFieldSpec[]): OperationalModelFieldSpec[] {
  return fields
    .map((field, index) => ({ field, index }))
    .sort((a, b) => {
      const ao = fieldOrderSortKey(a.field, a.index);
      const bo = fieldOrderSortKey(b.field, b.index);
      if (ao !== bo) return ao - bo;
      return a.index - b.index;
    })
    .map(({ field }) => field);
}

/** Minimal shape of an entry type needed to resolve its field specs. */
export interface OperationalModelEntryTypeLike {
  id?: string;
  name?: string;
  form_schema?: {
    _manifest_entry_type_key?: string;
    fields?: OperationalModelFieldSpec[];
  };
}

/**
 * Resolve an entry type from a slug/key, matching (in order) the manifest key
 * (`form_schema._manifest_entry_type_key`), the display name, then the node id.
 *
 * Matching on the name alone broke types whose display name differs from their
 * manifest key. As a defensive fallback a single-entry-type track
 * resolves to that type, so a form/detail can never silently render fieldless.
 */
export function findEntryTypeBySlug<T extends OperationalModelEntryTypeLike>(
  entryTypes: T[],
  entryType: string
): T | null {
  const wanted = slugEntryTypeName(String(entryType || ''));
  if (!wanted) return null;
  const byKey = entryTypes.find(et => {
    const key = String(et.form_schema?._manifest_entry_type_key || '');
    return Boolean(key) && slugEntryTypeName(key) === wanted;
  });
  if (byKey) return byKey;
  const byName = entryTypes.find(
    et => slugEntryTypeName(String(et.name || '')) === wanted
  );
  if (byName) return byName;
  const byId = entryTypes.find(
    et => Boolean(et.id) && slugEntryTypeName(String(et.id)) === wanted
  );
  if (byId) return byId;
  return entryTypes.length === 1 ? entryTypes[0] : null;
}

/**
 * Resolve the field specs to render for an entry's type (see
 * {@link findEntryTypeBySlug} for the matching rules).
 */
export function resolveEntryProfileFields(
  entryTypes: OperationalModelEntryTypeLike[],
  entryType: string
): OperationalModelFieldSpec[] {
  const match = findEntryTypeBySlug(entryTypes, entryType);
  return sortFieldsByOrder(
    (match?.form_schema?.fields || []) as OperationalModelFieldSpec[]
  );
}

export function isEmptyCustomFieldValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && !value.trim()) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

/** Required profile fields with no value in ``values`` (calendar quick-add guard). */
export function getMissingRequiredFields(
  fields: OperationalModelFieldSpec[],
  values: Record<string, unknown> | undefined
): OperationalModelFieldSpec[] {
  const vals = values ?? {};
  return fields.filter(
    field => field.required && isEmptyCustomFieldValue(vals[field.key])
  );
}

/** Custom field keys not declared on the entry type schema (system ``_`` keys excluded). */
export function getDisallowedCustomFieldKeys(
  fields: OperationalModelFieldSpec[],
  values: Record<string, unknown> | undefined
): string[] {
  if (!values) return [];
  const allowedKeys = new Set(fields.map(f => f.key).filter(Boolean));
  return Object.keys(values).filter(
    key => !key.startsWith('_') && !allowedKeys.has(key)
  );
}

function formatDateLike(raw: string, withTime: boolean): string {
  try {
    const d = parseISO(raw.trim());
    if (!isValid(d)) return raw;
    return withTime ? format(d, 'PPp') : format(d, 'PP');
  } catch {
    return raw;
  }
}

export function formatCustomFieldValue(
  field: OperationalModelFieldSpec,
  value: unknown,
  enumLabels?: Record<string, string>
): string {
  const t = String(field.type || 'text').toLowerCase();

  if (t === 'select') {
    if (value === null || value === undefined || value === '') return '';
    const key = String(value);
    const custom = enumLabels?.[key];
    if (custom?.trim()) return custom.trim();
    return humanizeEnumValue(key);
  }

  if (t === 'multi_select') {
    const arr = Array.isArray(value) ? value.map(String) : [];
    if (!arr.length) return '';
    return arr
      .map(v => {
        const custom = enumLabels?.[v];
        if (custom?.trim()) return custom.trim();
        return humanizeEnumValue(v);
      })
      .join(', ');
  }

  if (t === 'relation' || t === 'member') {
    // Relation / member rendering is owned by <RelationValue> / <MemberValue>,
    // which resolve ids to labels asynchronously. This branch only fires when
    // callers stringify outside the renderer — return the raw id(s) so debug /
    // export paths stay deterministic instead of returning empty.
    if (Array.isArray(value)) return value.map(String).join(', ');
    if (value != null && value !== '') return String(value);
    return '';
  }

  if (t === 'boolean') {
    if (value === null || value === undefined) return '';
    return value ? 'Yes' : 'No';
  }

  if (t === 'number') {
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (value != null && value !== '') return String(value);
    return '';
  }

  if (t === 'date' || t === 'datetime') {
    const s = value == null ? '' : String(value).trim();
    if (!s) return '';
    return formatDateLike(s, t === 'datetime');
  }

  if (t === 'json') {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') {
      try {
        return JSON.stringify(JSON.parse(value), null, 2);
      } catch {
        return value;
      }
    }
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function shouldRenderMetaField(
  field: OperationalModelFieldSpec,
  value: unknown,
  _variant: 'detail' | 'card'
): boolean {
  if (field.key.startsWith('_')) return false;
  // Card/list only: a field may be hidden from cards but shown on the detail.
  if (_variant === 'card' && field.hide_on_card) return false;
  const fieldType = String(field.type || '').toLowerCase();
  // Detail: always show relation / member / file rows (incl. empty) so fields
  // like Task → Sprint or Media are settable without hunting Edit. Cards stay
  // compact — only populated relations and attachments appear.
  if (
    fieldType === 'relation' ||
    fieldType === 'member' ||
    fieldType === 'file' ||
    fieldType === 'files'
  ) {
    if (_variant === 'detail') return true;
    return !isEmptyCustomFieldValue(value);
  }
  const formatted = formatCustomFieldValue(field, value);
  return formatted.trim().length > 0;
}

/** Feed card body truncation length (characters). */
export const FEED_CARD_BODY_PREVIEW_CHARS = 200;

export interface CardMetaRow {
  field: OperationalModelFieldSpec;
  text: string;
  group?: string;
}

/**
 * Rows shown on feed cards. Used as a length heuristic for the More/Less
 * toggle in `feedCardPrimaryNeedsExpand`. Relation fields contribute their
 * raw id text here — actual card rendering goes through <RelationValue>
 * which resolves ids to labels asynchronously.
 */
export function collectCardMetaRows(
  fields: OperationalModelFieldSpec[],
  values: Record<string, unknown>
): CardMetaRow[] {
  const ordered = sortFieldsByOrder(fields);
  const rows: CardMetaRow[] = [];
  for (const field of ordered) {
    const raw = values[field.key];
    if (!shouldRenderMetaField(field, raw, 'card')) continue;
    const text = formatCustomFieldValue(field, raw);
    if (!text.trim()) continue;
    rows.push({
      field,
      text,
      group: (field.group || '').trim() || undefined,
    });
  }
  return rows;
}

export const FEED_CARD_TITLE_CLAMP_CHARS = 120;
const FEED_META_TOTAL_AT = 220;
const FEED_META_SINGLE_AT = 100;

/** True when collapsed feed preview should offer More/Less (body, title, or meta). */
export function feedCardPrimaryNeedsExpand(opts: {
  body: string;
  title?: string;
  fields: OperationalModelFieldSpec[];
  values: Record<string, unknown>;
}): boolean {
  const body = opts.body || '';
  if (body.length > FEED_CARD_BODY_PREVIEW_CHARS) return true;
  const title = (opts.title || '').trim();
  if (title.length > FEED_CARD_TITLE_CLAMP_CHARS) return true;
  const rows = collectCardMetaRows(opts.fields, opts.values);
  if (rows.length === 0) return false;
  const total = rows.reduce((n, r) => n + r.text.length, 0);
  if (total > FEED_META_TOTAL_AT) return true;
  return rows.some(r => r.text.length > FEED_META_SINGLE_AT);
}
