import type { OperationalModelFieldSpec } from '../types';

/** Setting key declared on a field via ``default_from_setting``, if any. */
export function fieldDefaultSettingKey(
  field: Pick<OperationalModelFieldSpec, 'default_from_setting'>,
): string {
  return typeof field.default_from_setting === 'string'
    ? field.default_from_setting.trim()
    : '';
}

/**
 * Build a ``custom_fields`` patch from App settings for fields that declare
 * ``default_from_setting``. Skips keys that already have a non-empty value.
 * Never locks the control — callers seed only.
 */
export function patchFromAppSettings(
  fields: Array<Pick<OperationalModelFieldSpec, 'key' | 'default_from_setting'>>,
  settings: Record<string, unknown> | null | undefined,
  current: Record<string, unknown> | null | undefined = {},
): Record<string, unknown> {
  const bag = settings && typeof settings === 'object' ? settings : {};
  const cur = current && typeof current === 'object' ? current : {};
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    const settingKey = fieldDefaultSettingKey(field);
    if (!settingKey || !field.key) continue;
    const existing = cur[field.key];
    if (existing !== undefined && existing !== null && String(existing).trim() !== '') {
      continue;
    }
    const raw = bag[settingKey];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === 'string' && raw.trim() === '') continue;
    patch[field.key] = raw;
  }
  return patch;
}
