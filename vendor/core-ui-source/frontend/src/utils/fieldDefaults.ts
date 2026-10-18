/** Resolve declarative field ``default`` values for create forms.

 * Core-wide sentinels any App may put on a field in its OM YAML.
 * Not domain-specific (Finance, CRM, … just set ``default: $today``).
 *
 * Supported sentinels:
 * - ``$today`` / ``today`` — local calendar date as ``YYYY-MM-DD``
 *
 * For App-settings prefill use ``default_from_setting`` (see
 * ``fieldSettingDefaults.ts``) — not a string sentinel here, because the
 * value is resolved asynchronously from the parent App.
 */
export function resolveFieldDefault(raw: unknown, now: Date = new Date()): unknown {
  if (typeof raw !== 'string') return raw;
  const key = raw.trim().toLowerCase();
  if (key === '$today' || key === 'today') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return raw;
}
