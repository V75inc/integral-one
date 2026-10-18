import { entryTypesApi } from '../../../api/entryTypes';
import type { OperationalModelFieldSpec, EntryTypeNode, SavedView } from '../../../types';

/** Entry types that support the Wiki view (``view_type: wiki``) parent relation. */
const WIKI_PAGE_TYPE_PRIORITY = ['page', 'doc'] as const;

function slug(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Read view constraints from node fields and persisted manifest config. */
export function getWikiViewConstraints(view: SavedView): {
  entryTypeKeys: string[];
  defaultEntryTypeKey: string;
} {
  const cfg = (view.config || {}) as Record<string, unknown>;
  const fromNode = (view.entry_type_keys || [])
    .map(k => slug(k))
    .filter(Boolean);
  const fromCfg = (Array.isArray(cfg.entry_type_keys) ? cfg.entry_type_keys : [])
    .map(k => slug(String(k)))
    .filter(Boolean);
  const entryTypeKeys = fromNode.length ? fromNode : fromCfg;
  const defaultEntryTypeKey = slug(
    view.default_entry_type_key ||
      String(cfg.default_entry_type || '') ||
      ''
  );
  return { entryTypeKeys, defaultEntryTypeKey };
}

function entryTypeHasParentRelation(
  et: EntryTypeNode,
  parentFieldKey: string
): boolean {
  const fields = (et.form_schema?.fields || []) as OperationalModelFieldSpec[];
  const want = slug(parentFieldKey);
  return fields.some(f => {
    if (slug(f.key) !== want) return false;
    return String(f.type || '').toLowerCase() === 'relation';
  });
}

/**
 * Entry type slug used when creating wiki pages. Never falls back to the
 * track-level default (e.g. ``note``) — wiki pages require a type that
 * supports the view's ``parent_field``.
 */
export function resolveWikiPageEntryType(view: SavedView): string {
  const { entryTypeKeys, defaultEntryTypeKey } = getWikiViewConstraints(view);

  if (defaultEntryTypeKey && WIKI_PAGE_TYPE_PRIORITY.includes(defaultEntryTypeKey as 'page' | 'doc')) {
    return defaultEntryTypeKey;
  }
  if (
    defaultEntryTypeKey &&
    (!entryTypeKeys.length || entryTypeKeys.includes(defaultEntryTypeKey))
  ) {
    return defaultEntryTypeKey;
  }

  for (const preferred of WIKI_PAGE_TYPE_PRIORITY) {
    if (entryTypeKeys.includes(preferred)) return preferred;
  }

  if (entryTypeKeys.length === 1) return entryTypeKeys[0];

  return 'page';
}

/**
 * Resolve the wiki page entry type against live EntryType nodes on the track.
 * Picks the first type whose form schema includes the wiki ``parent`` relation.
 */
export async function resolveWikiPageEntryTypeForTrack(
  trackId: string,
  view: SavedView,
  parentField: string
): Promise<string> {
  const parentKey = parentField.startsWith('custom_fields.')
    ? parentField.slice('custom_fields.'.length)
    : parentField;
  const fallback = resolveWikiPageEntryType(view);
  const types = await entryTypesApi.list({ track_id: trackId });

  const matchesConstraint = (name: string) => {
    const s = slug(name);
    const { entryTypeKeys } = getWikiViewConstraints(view);
    return !entryTypeKeys.length || entryTypeKeys.includes(s);
  };

  for (const preferred of WIKI_PAGE_TYPE_PRIORITY) {
    const hit = types.find(
      t => slug(t.name) === preferred && matchesConstraint(t.name) && entryTypeHasParentRelation(t, parentKey)
    );
    if (hit) return slug(hit.name);
  }

  if (fallback) {
    const byFallback = types.find(t => slug(t.name) === slug(fallback));
    if (byFallback && entryTypeHasParentRelation(byFallback, parentKey)) {
      return slug(byFallback.name);
    }
  }

  for (const et of types) {
    if (!entryTypeHasParentRelation(et, parentKey)) continue;
    if (!matchesConstraint(et.name)) continue;
    return slug(et.name);
  }

  throw new Error(`No page entry type has the ${parentKey} relation field`);
}

export function isWikiCapableEntryType(
  entryType: string,
  viewEntryTypeKeys?: string[]
): boolean {
  const t = entryType.toLowerCase().trim();
  const keys = (viewEntryTypeKeys || []).map(k => k.toLowerCase().trim()).filter(Boolean);
  if (keys.length) return keys.includes(t);
  return (
    WIKI_PAGE_TYPE_PRIORITY.includes(t as (typeof WIKI_PAGE_TYPE_PRIORITY)[number]) ||
    t === 'post'
  );
}
