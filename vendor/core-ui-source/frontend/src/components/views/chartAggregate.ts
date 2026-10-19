import type { Entry } from '../../types';
import { resolveEntryFieldValue } from '../../utils/entryFieldValue';

/**
 * Pure, framework-free field-path resolution + aggregation helpers for
 * ``ChartRegionWidget``'s ``source: 'track'`` mode. Field paths distinguish
 * platform fields from business fields through the shared information
 * contract; use ``custom_fields.<key>`` whenever a business key could be
 * confused with a platform field.
 */

export function getFieldValue(entry: Entry, field: string): unknown {
  return resolveEntryFieldValue(entry, field);
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function toGroupKey(value: unknown): string {
  if (value == null || value === '') return '(none)';
  if (typeof value === 'object') {
    const id = (value as { id?: string; title?: string }).title ?? (value as { id?: string }).id;
    return id != null ? String(id) : '(none)';
  }
  return String(value);
}

/** Group entries by the (possibly dotted) value of `field`. */
export function groupBy(entries: Entry[], field: string): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>();
  for (const entry of entries) {
    const key = toGroupKey(getFieldValue(entry, field));
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }
  return groups;
}

export type AggregateMode = 'count' | 'sum' | 'avg';

export interface AggregatePoint {
  key: string;
  value: number;
}

/**
 * Reduce grouped entries to one numeric point per group. `count` ignores
 * `valueField`; `sum`/`avg` skip entries whose `valueField` isn't a finite
 * number (missing/null/non-numeric) rather than treating them as 0, so a
 * handful of unset values don't silently drag an average down.
 */
export function aggregate(
  groups: Map<string, Entry[]>,
  opts: { mode: AggregateMode; valueField?: string }
): AggregatePoint[] {
  const { mode, valueField } = opts;
  const points: AggregatePoint[] = [];
  for (const [key, entries] of groups) {
    if (mode === 'count') {
      points.push({ key, value: entries.length });
      continue;
    }
    const nums = valueField
      ? entries
          .map(e => toNumber(getFieldValue(e, valueField)))
          .filter((n): n is number => n != null)
      : [];
    if (!nums.length) {
      points.push({ key, value: 0 });
      continue;
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    points.push({ key, value: mode === 'avg' ? sum / nums.length : sum });
  }
  return points;
}

/**
 * Bucket entries into `YYYY-MM` keys by a date field. Entries with a
 * missing/unparseable date are excluded (not crashed on, not bucketed into
 * a misleading "undefined" group).
 */
export function bucketByMonth(entries: Entry[], dateField: string): Map<string, Entry[]> {
  const buckets = new Map<string, Entry[]>();
  for (const entry of entries) {
    const raw = getFieldValue(entry, dateField);
    if (raw == null || raw === '') continue;
    const d = new Date(String(raw));
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }
  return buckets;
}
