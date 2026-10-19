/**
 * humanizeFieldKey — turn an internal field key into a user-facing label.
 *
 * Substrate field keys are snake_case (`details_track`, `close_date`,
 * `_cp_index`). When we render those keys to end users without a
 * configured label, fall back to a Title Case form.
 *
 * Examples:
 *   "details_track" → "Details"  (trailing "_track" stripped)
 *   "close_date"    → "Close date"
 *   "_cp_index"     → ""          (leading-underscore internal keys hidden)
 *   "ACME"          → "ACME"
 */
export function humanizeFieldKey(key: string | null | undefined): string {
  if (!key) return '';
  // Internal / private keys (leading underscore) are not user-facing.
  if (key.startsWith('_')) return '';
  // "X_track" → "X" — the track suffix is internal scaffolding from the
  // anchor-pattern field-key naming convention.
  const stripped = key.replace(/_track$/u, '');
  return titleCaseSnake(stripped);
}

/**
 * humanizeEnumValue — Title-Case a select-field enum value when the
 * substrate ships only the bare value (no separate label). Unlike
 * humanizeFieldKey, this does NOT strip "_track" suffixes and does NOT
 * hide leading-underscore keys; enum values are themselves user-facing
 * vocabulary so even oddly-shaped tokens are passed through with just
 * casing fixed.
 *
 * Examples:
 *   "prospecting" → "Prospecting"
 *   "closed_won"  → "Closed won"
 *   "qualifies_q3"→ "Qualifies q3"
 *   "GYD"         → "GYD"          (already-uppercase single token: an
 *                                    acronym/currency code, not a casing
 *                                    accident — title-casing it would turn
 *                                    a recognizable "GYD" into "Gyd")
 *   "Needs Repair" → "Needs Repair" (an authored label, not a machine key)
 */
export function humanizeEnumValue(value: string | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (!s) return '';
  // A single token that's already all-caps (ISO currency/country codes,
  // acronyms) is user-facing vocabulary in its own right — pass it through
  // unchanged rather than mangling it via Title Case. A multi-word value
  // like "IN_PROGRESS" still gets humanized normally.
  if (/^[A-Z0-9]+$/u.test(s)) return s;
  // Preserve explicitly cased human labels such as "Needs Repair". Only
  // normalize multi-word strings whose casing looks like a machine value.
  if (/\s/u.test(s) && /[A-Z]/u.test(s) && !/[_-]/u.test(s)) return s;
  return titleCaseSnake(s);
}

function titleCaseSnake(s: string): string {
  const parts = s.split(/[_\-\s]+/u).filter(Boolean);
  if (parts.length === 0) return '';
  return (
    parts[0].charAt(0).toUpperCase() +
    parts[0].slice(1).toLowerCase() +
    parts.slice(1).map(p => ' ' + p.toLowerCase()).join('')
  );
}
