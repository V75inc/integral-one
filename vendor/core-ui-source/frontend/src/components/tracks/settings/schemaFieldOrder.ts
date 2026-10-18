import type { EntryTypeNode, OperationalModelFieldSpec } from '../../../types';
import { sortFieldsByOrder } from '../../../utils/entryMetaFields';

export const BASE_FIELD_PREFIX = '__base.';

/** Editor-only rows; base fields remain in their canonical schema slots. */
export function orderedSchemaFields(schema: EntryTypeNode['form_schema']): OperationalModelFieldSpec[] {
  const base = schema?.base_fields;
  return sortFieldsByOrder([
    ...(base?.title?.enabled === false ? [] : [{ key: '__base.title', name: base?.title?.label || 'Title', type: 'text', order: base?.title?.order ?? 0 }]),
    ...(schema?.fields ?? []).map((field, index) => ({ ...field, order: field.order ?? 200 + index * 10 })),
    ...(base?.body?.enabled === false ? [] : [{ key: '__base.body', name: base?.body?.label || 'Details', type: 'markdown', order: base?.body?.order ?? 1000 }]),
  ]);
}

export function withOrderedFields(schema: EntryTypeNode['form_schema'], fields: OperationalModelFieldSpec[]): NonNullable<EntryTypeNode['form_schema']> {
  const baseFields = { ...schema?.base_fields };
  for (const key of ['title', 'body'] as const) {
    const row = fields.find(field => field.key === `${BASE_FIELD_PREFIX}${key}`);
    if (row) baseFields[key] = { ...baseFields[key], order: row.order };
  }
  return {
    ...schema,
    fields: fields.filter(field => !field.key.startsWith(BASE_FIELD_PREFIX)),
    ...(fields.some(field => field.key.startsWith(BASE_FIELD_PREFIX)) ? { base_fields: baseFields } : {}),
  };
}
