/** Resolve an entry id from a relation field value (scalar or object). */
export function relationEntryId(value: unknown): string {
  if (value == null || value === '') return '';
  if (Array.isArray(value)) return String(value[0] ?? '').trim();
  if (typeof value === 'object') {
    const row = value as { id?: string; entry_id?: string };
    return String(row.id || row.entry_id || '').trim();
  }
  return String(value).trim();
}

/** Contract template id from relation field or legacy scalar. */
export function contractTemplateIdFromFields(
  customFields: Record<string, unknown> | undefined | null,
): string {
  const cf = customFields || {};
  const rel = relationEntryId(cf.contract_template);
  if (rel) return rel;
  return relationEntryId(cf.contract_template_id);
}
