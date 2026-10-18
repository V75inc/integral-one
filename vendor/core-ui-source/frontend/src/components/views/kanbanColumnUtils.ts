import {
  isEmptyCustomFieldValue,
  sortFieldsByOrder,
  getMissingRequiredFields,
} from '../../utils/entryMetaFields';
import type {
  OperationalModelFieldSpec,
  Entry,
  EntryTypeNode,
  SavedView,
} from '../../types';
import { randomUUID } from '../../utils/randomUUID';

export const KANBAN_STAGE_KEY = '_kanban_stage';
export const KANBAN_ORDER_KEY = '_kanban_order';
export const UNASSIGNED_COLUMN_KEY = '__unassigned';

export const DEFAULT_KANBAN_GROUP_BY = `custom_fields.${KANBAN_STAGE_KEY}`;

/** Workflow select keys checked when healing legacy ``_kanban_stage`` views. */
const WORKFLOW_FIELD_ALIASES = ['status', 'stage'] as const;

export interface KanbanColumnSpec {
  key: string;
  label?: string;
  color?: string;
  /** False when the column is display-only (status is set by the app, not a drag). */
  drop_target?: boolean;
  /** Source column keys that may move into this column. Omit to allow any source. */
  accepts_from?: string[];
  /** When set, a drop runs this action instead of writing the group field. */
  on_drop?: KanbanColumnDrop;
}

/** Declarative drop action stored on a kanban column (`on_drop` in the view config). */
export interface KanbanColumnDrop {
  kind?: string;
  operation?: string;
  title?: string;
  message?: string;
  confirm?: string;
  confirm_label?: string;
  success_message?: string;
  payload?: Record<string, unknown>;
  fields?: KanbanColumnDropField[];
  /** Entry paths that must be non-empty before the drop runs. */
  requires?: KanbanColumnDropRequire[];
}

export interface KanbanColumnDropRequire {
  path?: string;
  message?: string;
}

export interface KanbanColumnDropField {
  key: string;
  label?: string;
  type?: string;
  source?: string;
  default?: string;
  optional?: boolean;
  options?: Array<string | { value?: string; label?: string }>;
}

/** Slugify a column label into a stable board key (matches backend slug style). */
export function slugifyKanbanColumnKey(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Match manifest keys (``content_piece``) to entry type names (``ContentPiece``). */
export function entryTypeMatchesSlug(name: string, slug: string): boolean {
  const nameSlug = slugifyKanbanColumnKey(name);
  const want = slugifyKanbanColumnKey(slug);
  if (!nameSlug || !want) return false;
  if (nameSlug === want) return true;
  return nameSlug.replace(/_/g, '') === want.replace(/_/g, '');
}

/** True when ``slug`` matches any member of the track's allowed entry-type slug set. */
export function slugMatchesAllowedEntryTypes(
  slug: string,
  allowed: Set<string>
): boolean {
  if (!allowed.size) return true;
  if (allowed.has(slug)) return true;
  for (const a of allowed) {
    if (entryTypeMatchesSlug(a, slug)) return true;
  }
  return false;
}

/** Pick a unique column key from a label, suffixing ``_2``, ``_3``, … on collision. */
export function uniqueKanbanColumnKey(
  label: string,
  existingKeys: Iterable<string>
): string {
  const taken = new Set(existingKeys);
  const base = slugifyKanbanColumnKey(label) || 'column';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

/** Opaque key for user-created kanban columns (not derived from the label). */
export function generateKanbanColumnKey(existingKeys: Iterable<string>): string {
  const taken = new Set(existingKeys);
  let key = '';
  do {
    const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
    key = `col_${suffix}`;
  } while (taken.has(key));
  return key;
}

function readKanbanColumnsFromView(view: SavedView): KanbanColumnSpec[] {
  if (view.type !== 'kanban') return [];
  const config = (view.config || {}) as Record<string, unknown>;
  const raw = config.kanban_columns as Array<{ key?: string; label?: string }> | undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(c => ({
      key: String(c.key || '').trim(),
      label: String(c.label || '').trim() || undefined,
    }))
    .filter(c => c.key);
}

/** Map kanban column keys to user-facing labels for a workflow select field. */
export function buildKanbanWorkflowEnumLabels(
  view: SavedView,
  fieldKey: string,
  fields?: OperationalModelFieldSpec[]
): Record<string, string> {
  if (view.type !== 'kanban' || !fieldKey) return {};
  const config = (view.config || {}) as Record<string, unknown>;
  const groupBy = resolveKanbanGroupBy(config.group_by);
  const writeFieldKey = resolveKanbanWriteFieldKey(groupBy, fields);
  if (writeFieldKey !== fieldKey) return {};

  const labels: Record<string, string> = {};
  for (const col of readKanbanColumnsFromView(view)) {
    if (col.label) labels[col.key] = col.label;
  }
  return labels;
}

/** Resolve workflow select labels from track kanban views (active view wins on conflict). */
export function resolveKanbanWorkflowEnumLabelsForTrack(
  views: SavedView[],
  fields?: OperationalModelFieldSpec[],
  activeViewId?: string
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const kanbanViews = views.filter(v => v.type === 'kanban');
  if (!kanbanViews.length) return out;

  const ordered = activeViewId
    ? [
        ...kanbanViews.filter(v => v.id !== activeViewId),
        ...kanbanViews.filter(v => v.id === activeViewId),
      ]
    : kanbanViews;

  for (const view of ordered) {
    const config = (view.config || {}) as Record<string, unknown>;
    const groupBy = resolveKanbanGroupBy(config.group_by);
    const fieldKey = resolveKanbanWriteFieldKey(groupBy, fields);
    if (!fieldKey || fieldKey === KANBAN_STAGE_KEY || fieldKey.startsWith('_')) continue;
    const spec = fields?.find(f => f.key === fieldKey);
    if (!isWorkflowSelectField(spec)) continue;

    const labels = buildKanbanWorkflowEnumLabels(view, fieldKey, fields);
    if (!Object.keys(labels).length) continue;
    out[fieldKey] = { ...(out[fieldKey] ?? {}), ...labels };
  }
  return out;
}

/** Entry-type slug to use when quick-adding a card on a constrained view. */
export function resolveViewCreateEntryTypeKey(view: SavedView): string | undefined {
  const def = String(view.default_entry_type_key || '').trim();
  if (def) return slugifyKanbanColumnKey(def);
  const keys = view.entry_type_keys;
  if (keys?.length) return slugifyKanbanColumnKey(String(keys[0]));
  return undefined;
}

/** Extract the custom_fields key from a kanban ``group_by`` path. */
export function resolveKanbanGroupFieldKey(groupBy: string): string {
  const g = String(groupBy || '').trim();
  if (g.startsWith('custom_fields.')) {
    return g.slice('custom_fields.'.length).split('.').pop() || g;
  }
  return g.split('.').pop() || g;
}

/** Resolve persisted ``group_by`` — bare ``status`` maps to system ``_kanban_stage``;
 *  explicit ``custom_fields.status`` and other profile paths are preserved. */
export function resolveKanbanGroupBy(raw: unknown): string {
  const g = String(raw || '').trim();
  if (!g || g === 'status') {
    return DEFAULT_KANBAN_GROUP_BY;
  }
  return g;
}

function isWorkflowSelectField(spec: OperationalModelFieldSpec | undefined): boolean {
  if (!spec) return false;
  const ftype = String(spec.type || '').toLowerCase();
  return ftype === 'select' || ftype === 'multi_select';
}

/** First workflow select field on the entry type (status, then stage). */
export function findWorkflowSelectFieldKey(
  fields: OperationalModelFieldSpec[] | undefined
): string | undefined {
  if (!fields?.length) return undefined;
  for (const alias of WORKFLOW_FIELD_ALIASES) {
    const spec = fields.find(f => f.key === alias);
    if (isWorkflowSelectField(spec)) return alias;
  }
  return undefined;
}

/** Field key to persist when placing a card in a column (drag, quick-add, enum sync). */
export function resolveKanbanWriteFieldKey(
  groupBy: string,
  fields: OperationalModelFieldSpec[] | undefined
): string {
  const resolved = resolveKanbanGroupBy(groupBy);
  const fieldKey = resolveKanbanGroupFieldKey(resolved);
  const spec = fields?.find(f => f.key === fieldKey);
  const ftype = String(spec?.type || '').toLowerCase();
  if (fieldKey !== KANBAN_STAGE_KEY && (isWorkflowSelectField(spec) || ftype === 'member' || ftype === 'relation')) {
    return fieldKey;
  }
  if (fieldKey === KANBAN_STAGE_KEY) {
    const workflow = findWorkflowSelectFieldKey(fields);
    if (workflow) return workflow;
  }
  return fieldKey;
}

/** ``group_by`` path for enum sync — uses the effective write field. */
export function resolveKanbanEnumSyncGroupBy(
  groupBy: string,
  fields: OperationalModelFieldSpec[] | undefined
): string {
  const fieldKey = resolveKanbanWriteFieldKey(groupBy, fields);
  return fieldKey.includes('.') ? fieldKey : `custom_fields.${fieldKey}`;
}

/** True when ``group_by`` targets a profile select whose enum must include column keys. */
export function shouldSyncKanbanColumnEnum(
  groupBy: string,
  fields: OperationalModelFieldSpec[] | undefined
): boolean {
  const fieldKey = resolveKanbanGroupFieldKey(groupBy);
  if (!fieldKey || fieldKey.startsWith('_')) return false;
  if (fieldKey === KANBAN_STAGE_KEY || fieldKey === KANBAN_ORDER_KEY) return false;

  const spec = fields?.find(f => f.key === fieldKey);
  if (!spec) return false;
  return isWorkflowSelectField(spec);
}

/** True when a new kanban column should append to a profile select enum. */
export function shouldSyncKanbanColumnEnumForView(
  groupBy: string,
  fields: OperationalModelFieldSpec[] | undefined
): boolean {
  return shouldSyncKanbanColumnEnum(resolveKanbanEnumSyncGroupBy(groupBy, fields), fields);
}

export function getGroupFieldValue(entry: Entry, groupBy: string): string {
  const e = entry as unknown as Record<string, unknown>;
  if (groupBy.includes('.')) {
    const parts = groupBy.split('.');
    let val: unknown = entry;
    for (const p of parts) {
      val = (val as Record<string, unknown>)?.[p];
      if (val === undefined || val === null) return '';
    }
    return String(val);
  }
  const customFields = (e.custom_fields || {}) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(customFields, groupBy)) {
    const v = customFields[groupBy];
    if (v == null || v === '') return '';
    return String(v);
  }
  const top = e[groupBy];
  if (top == null || top === '') return '';
  return String(top);
}

/** Read the value that places a card in a column (primary group_by, then legacy fallbacks). */
export function getKanbanStageValue(entry: Entry, groupBy: string): string {
  const resolved = resolveKanbanGroupBy(groupBy);
  const primary = getGroupFieldValue(entry, resolved);
  if (primary.trim()) return primary;

  if (resolved !== DEFAULT_KANBAN_GROUP_BY) {
    for (const alias of WORKFLOW_FIELD_ALIASES) {
      const legacy = getGroupFieldValue(entry, `custom_fields.${alias}`);
      if (legacy.trim()) return legacy;
    }
  } else {
    for (const alias of WORKFLOW_FIELD_ALIASES) {
      const legacy = getGroupFieldValue(entry, `custom_fields.${alias}`);
      if (legacy.trim()) return legacy;
    }
  }

  return getGroupFieldValue(entry, DEFAULT_KANBAN_GROUP_BY);
}

/** Map an entry's group-by value to a board column key. Unmatched → ``UNASSIGNED_COLUMN_KEY``. */
export function resolveEntryColumnKey(
  entry: Entry,
  columns: KanbanColumnSpec[],
  groupBy: string
): string {
  const raw = getKanbanStageValue(entry, groupBy).trim();
  if (!raw) return UNASSIGNED_COLUMN_KEY;
  const exact = columns.find(c => c.key === raw);
  if (exact) return exact.key;
  const lower = raw.toLowerCase();
  const byKey = columns.find(c => c.key.toLowerCase() === lower);
  if (byKey) return byKey.key;
  const byLabel = columns.find(
    c => (c.label || '').trim().toLowerCase() === lower
  );
  if (byLabel) return byLabel.key;
  return UNASSIGNED_COLUMN_KEY;
}

const HIDDEN_KANBAN_CUSTOM_FIELD_KEYS = new Set([
  '_entry_type_slug',
  '_link_preview',
  '_cp_index',
]);

/** Profile custom-field keys that must not surface on kanban card chips. */
export function isKanbanInternalCustomFieldKey(key: string): boolean {
  return key.startsWith('_') || HIDDEN_KANBAN_CUSTOM_FIELD_KEYS.has(key);
}

export const DEFAULT_KANBAN_CARD_FIELD_LIMIT = 4;

/** Indexed scalar fields suitable as default kanban card chips (excludes group column). */
export function isKanbanCardFieldCandidate(
  field: OperationalModelFieldSpec,
  groupWriteFieldKey: string
): boolean {
  if (!field.key || isKanbanInternalCustomFieldKey(field.key)) return false;
  if (field.key === groupWriteFieldKey) return false;
  if (field.key === KANBAN_ORDER_KEY || field.key === KANBAN_STAGE_KEY) return false;
  if (field.key === 'sprint') return true;
  const t = String(field.type || '').toLowerCase();
  if (t === 'relation' || t === 'json' || t === 'markdown') return false;
  return Boolean(field.index);
}

/** Default chip keys from entry-type schema when the view has no ``card_fields``. */
export function resolveDefaultKanbanCardFields(
  fields: OperationalModelFieldSpec[] | undefined,
  groupWriteFieldKey: string,
  limit = DEFAULT_KANBAN_CARD_FIELD_LIMIT
): string[] {
  if (!fields?.length) return [];
  const keys: string[] = [];
  for (const field of sortFieldsByOrder(fields)) {
    if (!isKanbanCardFieldCandidate(field, groupWriteFieldKey)) continue;
    keys.push(field.key);
    if (keys.length >= limit) break;
  }
  return keys;
}

/** User-configured ``card_fields`` win; otherwise derive indexed defaults. */
export function normalizeKanbanCardFieldKey(key: string): string {
  const k = String(key || '').trim();
  return k.startsWith('custom_fields.') ? k.slice('custom_fields.'.length) : k;
}

/** Select + member fields eligible for runtime group-by switching. */
export function resolveKanbanGroupByEligibleFields(
  fields: OperationalModelFieldSpec[] | undefined
): OperationalModelFieldSpec[] {
  if (!fields?.length) return [];
  return fields.filter(f => {
    const t = String(f.type || '').toLowerCase();
    return (t === 'select' || t === 'member' || (t === 'relation' && f.key === 'sprint')) && Boolean(f.key);
  });
}

/** Build board columns for the active group-by field (enum, member buckets, or config). */
export function buildKanbanColumnsForGroupField(
  groupBy: string,
  fields: OperationalModelFieldSpec[] | undefined,
  configured: KanbanColumnSpec[] | undefined,
  entries: Entry[],
  resolveMemberLabel?: (userId: string) => string | undefined,
  resolveRelationLabel?: (id: string, fieldKey?: string) => string | undefined
): KanbanColumnSpec[] {
  const resolvedGroupBy = resolveKanbanGroupBy(groupBy);
  const fieldKey = resolveKanbanGroupFieldKey(resolvedGroupBy);
  const spec = fields?.find(f => f.key === fieldKey);
  const fieldType = String(spec?.type || '').toLowerCase();

  if (fieldType === 'member') {
    const seen = new Set<string>();
    const cols: KanbanColumnSpec[] = [];
    for (const c of configured ?? []) {
      if (!c.key || seen.has(c.key)) continue;
      seen.add(c.key);
      cols.push({
        ...c,
        label:
          resolveMemberLabel?.(c.key) ??
          c.label ??
          `Member ${c.key.slice(-6)}`,
      });
    }
    for (const e of entries) {
      const id = getGroupFieldValue(e, resolvedGroupBy).trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        const configuredLabel = configured?.find(c => c.key === id)?.label;
        cols.push({
          key: id,
          label: resolveMemberLabel?.(id) ?? configuredLabel ?? `Member ${id.slice(-6)}`,
        });
      }
    }
    return cols;
  }

  if (fieldType === 'relation' || fieldKey === 'sprint') {
    const seen = new Set<string>();
    const cols: KanbanColumnSpec[] = [];
    for (const c of configured ?? []) {
      if (!c.key || seen.has(c.key)) continue;
      seen.add(c.key);
      cols.push({
        ...c,
        label:
          resolveRelationLabel?.(c.key, fieldKey) ??
          c.label ??
          c.key,
      });
    }
    for (const e of entries) {
      const id = getGroupFieldValue(e, resolvedGroupBy).trim();
      if (id && !seen.has(id)) {
        seen.add(id);
        const configuredLabel = configured?.find(c => c.key === id)?.label;
        cols.push({
          key: id,
          label: resolveRelationLabel?.(id, fieldKey) ?? configuredLabel ?? id,
        });
      }
    }
    return cols;
  }

  if (configured && configured.length > 0) {
    // Legacy layouts may omit a status that still exists on records. Recover
    // its column as those records load; a layout change must never hide data.
    const columns = [...configured];
    const seen = new Set(columns.map(column => column.key));
    for (const entry of entries) {
      const key = getGroupFieldValue(entry, resolvedGroupBy).trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        columns.push({ key, label: key.replace(/_/g, ' ') });
      }
    }
    return columns;
  }

  const enumVals = (spec?.enum ?? []) as string[];
  if (enumVals.length) {
    return enumVals.map(key => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
  }

  return configured ?? [];
}

export function resolveEffectiveKanbanCardFields(
  configured: string[] | undefined,
  fields: OperationalModelFieldSpec[] | undefined,
  groupWriteFieldKey: string
): string[] {
  if (Array.isArray(configured) && configured.length > 0) {
    return configured.map(normalizeKanbanCardFieldKey);
  }
  return resolveDefaultKanbanCardFields(fields, groupWriteFieldKey);
}

/** Narrow merged track fields to the view's entry-type slice for card defaults. */
export function resolveKanbanSchemaFields(
  allFields: OperationalModelFieldSpec[] | undefined,
  entryTypes: EntryTypeNode[] | undefined,
  view: SavedView,
  createEntryTypeKey: string | undefined
): OperationalModelFieldSpec[] {
  const viewKeys = (view.entry_type_keys ?? [])
    .map(k => slugifyKanbanColumnKey(String(k)))
    .filter(Boolean);
  const targets = viewKeys.length
    ? viewKeys
    : createEntryTypeKey
      ? [createEntryTypeKey]
      : [];
  if (!targets.length || !entryTypes?.length) return allFields ?? [];
  const out: OperationalModelFieldSpec[] = [];
  for (const et of entryTypes) {
    const slug = slugifyKanbanColumnKey(et.name || '');
    if (!targets.some(t => entryTypeMatchesSlug(slug, t))) continue;
    out.push(...((et.form_schema?.fields ?? []) as OperationalModelFieldSpec[]));
  }
  return out.length ? out : (allFields ?? []);
}

/** Default workflow custom_fields when creating from the track composer on a kanban view. */
export function resolveKanbanCreateCustomFieldFallback(
  view: SavedView,
  fields: OperationalModelFieldSpec[] | undefined
): Record<string, unknown> | undefined {
  if (view.type !== 'kanban') return undefined;
  const config = (view.config || {}) as Record<string, unknown>;
  const columns = config.kanban_columns as Array<{ key?: string }> | undefined;
  const firstKey = String(columns?.[0]?.key || '').trim();
  if (!firstKey) return undefined;
  const groupBy = resolveKanbanGroupBy(config.group_by);
  const groupKey = resolveKanbanWriteFieldKey(groupBy, fields);
  if (!groupKey || groupKey === KANBAN_STAGE_KEY || groupKey.startsWith('_')) {
    return undefined;
  }
  return { [groupKey]: firstKey };
}

/** Route kanban quick-add to compose when indexed fields beyond the column field are unset OR there are missing required fields. */
export function shouldRouteKanbanQuickAddToCompose(
  fields: OperationalModelFieldSpec[] | undefined,
  groupWriteFieldKey: string,
  seededCustomFields: Record<string, unknown> | undefined
): boolean {
  if (!fields?.length) return false;

  // Check if there are any missing required fields first
  const missingRequired = getMissingRequiredFields(fields, seededCustomFields);
  if (missingRequired.length > 0) {
    return true;
  }

  // Then check indexed beyond group field
  const seeded = seededCustomFields ?? {};
  const indexedBeyond = fields.filter(f =>
    isKanbanCardFieldCandidate(f, groupWriteFieldKey)
  );
  if (indexedBeyond.length === 0) return false;
  return indexedBeyond.some(f => isEmptyCustomFieldValue(seeded[f.key]));
}
