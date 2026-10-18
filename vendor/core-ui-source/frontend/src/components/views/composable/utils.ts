/**
 * Shared helpers for composable meta-widgets.
 *
 * These widgets are intentionally generic and config-driven so the
 * Integral agent can compose them via declarative manifest entries
 * (Pillar 4 of the agent-authorable substrate). Each widget reads
 * grouping / sorting / filtering / projection rules from
 * ``view.config`` and renders accordingly.
 */

import type { Entry } from '../../../types';
import { resolveTemplateVar, type ResolverContext } from './templateVarResolvers';

export type ComposableSortDirection = 'asc' | 'desc';

export interface ComposableSortRule {
  field: string;
  direction?: ComposableSortDirection;
}

export interface ComposableFilterRule {
  field: string;
  op?: 'eq' | 'neq' | 'contains' | 'in' | 'gt' | 'lt';
  value?: unknown;
}

export type ComposableProjection = string[];

/** Read a property off an entry, walking ``custom_fields`` for unknown keys. */
export function readEntryField(entry: Entry, key: string): unknown {
  if (!key) return undefined;
  if (key in entry) {
    return (entry as unknown as Record<string, unknown>)[key];
  }
  const custom = (entry as unknown as { custom_fields?: Record<string, unknown> })
    .custom_fields;
  return custom ? custom[key] : undefined;
}

/**
 * Apply manifest filter rules against an entry list.
 *
 * Phase 3.1 Plan 03.1-04 (ANC-07): rule values that are strings starting with
 * ``:`` are pre-resolved via the template-var resolver registry before the
 * comparison logic runs. Callers pass a ``ResolverContext`` carrying the
 * available v1 vars (``userId``, ``entryId``, ``anchoredTrackId``). Callers
 * without a context (legacy paths) pass nothing; ``:``-prefixed rule values
 * then resolve to ``null`` and the rule effectively never matches (fail-soft).
 */
export function applyFilters(
  entries: Entry[],
  rules: ComposableFilterRule[],
  context?: ResolverContext
): Entry[] {
  if (!rules.length) return entries;
  // Pre-resolve template-var rule values so the inner comparison loop sees a
  // concrete value (or null when the resolver could not resolve the token).
  const resolvedRules: ComposableFilterRule[] = rules.map(rule => {
    if (typeof rule.value === 'string' && rule.value.startsWith(':')) {
      const resolved = resolveTemplateVar(rule.value, context ?? {});
      return { ...rule, value: resolved };
    }
    return rule;
  });
  return entries.filter((entry) =>
    resolvedRules.every((rule) => {
      const value = readEntryField(entry, rule.field);
      const op = rule.op || 'eq';
      switch (op) {
        case 'eq':
          return value === rule.value;
        case 'neq':
          return value !== rule.value;
        case 'contains':
          return typeof value === 'string' && typeof rule.value === 'string'
            ? value.toLowerCase().includes(rule.value.toLowerCase())
            : false;
        case 'in':
          return Array.isArray(rule.value) ? rule.value.includes(value as never) : false;
        case 'gt':
          return typeof value === 'number' && typeof rule.value === 'number'
            ? value > rule.value
            : false;
        case 'lt':
          return typeof value === 'number' && typeof rule.value === 'number'
            ? value < rule.value
            : false;
        default:
          return true;
      }
    })
  );
}

export function applySort(entries: Entry[], rules: ComposableSortRule[]): Entry[] {
  if (!rules.length) return entries;
  const sorted = [...entries];
  sorted.sort((a, b) => {
    for (const rule of rules) {
      const av = readEntryField(a, rule.field);
      const bv = readEntryField(b, rule.field);
      const dir = rule.direction === 'desc' ? -1 : 1;
      if (av === bv) continue;
      if (av == null) return 1 * dir;
      if (bv == null) return -1 * dir;
      if (typeof av === 'number' && typeof bv === 'number') {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    }
    return 0;
  });
  return sorted;
}

/**
 * Group entries by a field value. Entries without the grouping field land
 * in an "" (empty key) bucket the renderer can label "Ungrouped".
 */
export function groupByField(
  entries: Entry[],
  field: string | undefined | null
): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  if (!field) {
    groups.set('', entries);
    return groups;
  }
  for (const entry of entries) {
    const raw = readEntryField(entry, field);
    const key = raw == null ? '' : String(raw);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }
  return groups;
}

/** Resolve a deterministic accent color from a value (used by ``color_by``). */
const COLOR_PALETTE = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
];

export function colorFromValue(value: unknown): string {
  if (value == null || value === '') return '#6b7280'; // gray
  const str = String(value);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}

export function readConfigArray<T = unknown>(
  config: Record<string, unknown> | undefined,
  key: string
): T[] {
  if (!config) return [];
  const raw = config[key];
  return Array.isArray(raw) ? (raw as T[]) : [];
}

export function readConfigString(
  config: Record<string, unknown> | undefined,
  key: string
): string | undefined {
  if (!config) return undefined;
  const raw = config[key];
  return typeof raw === 'string' && raw.trim() ? raw : undefined;
}

export function ungroupedLabel(): string {
  return 'Ungrouped';
}

/**
 * Build a ``ResolverContext`` from the ``config.__bindings`` forwarded by
 * ``ComposableViewSlot`` (``view.config.__bindings``, same namespace
 * ``FormRegionWidget``/``ChartRegionWidget``/``SummaryTilesWidget`` already
 * read from) so a widget's own ``filter``/``sort`` rules can resolve
 * ``:entry_id``/``:current_user``/``:anchored_track`` template-var values —
 * e.g. ``{field: 'pay_run', op: 'eq', value: ':entry_id'}`` on a related
 * view embedded on a Pay Run's own detail page. Key mapping matches every
 * other bindings-aware widget: ``entryId`` passes through as-is,
 * ``currentUser`` maps to the resolver registry's ``userId``.
 */
export function resolverContextFromBindings(
  config: Record<string, unknown> | undefined
): ResolverContext {
  const bindings = ((config || {}).__bindings || {}) as Record<string, unknown>;
  return {
    entryId: typeof bindings.entryId === 'string' ? bindings.entryId : undefined,
    userId: typeof bindings.currentUser === 'string' ? bindings.currentUser : undefined,
    anchoredTrackId:
      typeof bindings.anchoredTrackId === 'string' ? bindings.anchoredTrackId : undefined,
  };
}
