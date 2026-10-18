/**
 * Derive a date field from another date + a select's day map when the
 * field schema declares ``validation.auto_offset`` / ``validation.term_days``.
 *
 * This is a Core form primitive (no domain vocabulary). Apps supply the
 * keys and day map in their operational-model YAML — e.g. Finance wires
 * invoice ``payment_terms`` / ``due_date``; another App could wire
 * ``start_date`` / ``end_date`` the same way.
 */

import type { OperationalModelFieldSpec } from '../types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function addCalendarDays(isoDate: string, days: number): string | null {
  const base = String(isoDate || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) return null;
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return null;
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function termDaysMap(field: OperationalModelFieldSpec | undefined): Record<string, number> {
  const validation = asRecord(field?.validation);
  const raw = asRecord(validation?.term_days);
  if (!raw) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) continue;
    out[String(k).trim().toLowerCase()] = n;
  }
  return out;
}

function normalizeTermsKey(raw: unknown): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/**
 * When ``changedKey`` is the date or terms driver for an ``auto_offset``
 * target, return a patch that sets the target date (and only that key).
 */
export function deriveAutoOffsetPatch(
  fields: OperationalModelFieldSpec[],
  values: Record<string, unknown>,
  changedKey: string
): Record<string, unknown> | null {
  const byKey = new Map(fields.map(f => [f.key, f]));
  const patch: Record<string, unknown> = {};

  for (const field of fields) {
    const validation = asRecord(field.validation);
    const auto = asRecord(validation?.auto_offset);
    if (!auto) continue;
    const fromDate = String(auto.from_date || '').trim();
    const fromTerms = String(auto.from_terms || '').trim();
    if (!fromDate || !fromTerms) continue;
    if (changedKey !== fromDate && changedKey !== fromTerms && changedKey !== field.key) {
      continue;
    }
    // User is editing the target date itself — do not fight the keystroke.
    if (changedKey === field.key) continue;

    const dateVal = values[fromDate];
    const termsVal = values[fromTerms];
    const daysMap = termDaysMap(byKey.get(fromTerms));
    const termsKey = normalizeTermsKey(termsVal);
    const days = daysMap[termsKey];
    if (days === undefined) continue;
    const next = addCalendarDays(String(dateVal ?? ''), days);
    if (!next) continue;
    if (String(values[field.key] ?? '') === next) continue;
    patch[field.key] = next;
  }

  return Object.keys(patch).length ? patch : null;
}
