import type { OperationalModelFieldSpec } from '../../types';

/** Custom field keys that store a workspace document template id. */
export const DOCUMENT_TEMPLATE_FIELD_KEYS = new Set([
  'contract_template_id',
  'contract_template',
]);

const DEFAULT_DOCUMENT_TEMPLATE_CONFIG: Record<string, unknown> = {
  module: 'hr_app',
  document_type: 'employment_contract',
  status: 'active',
};

export function isDocumentTemplateField(field: OperationalModelFieldSpec): boolean {
  const type = String(field.type || '').toLowerCase();
  return (
    type === 'document_template' ||
    DOCUMENT_TEMPLATE_FIELD_KEYS.has(field.key)
  );
}

/** Upgrade legacy text fields + ensure document_template config defaults. */
export function coerceDocumentTemplateField(
  field: OperationalModelFieldSpec,
): OperationalModelFieldSpec {
  if (!isDocumentTemplateField(field)) return field;
  const existing = (field.config as Record<string, unknown> | undefined) ?? {};
  return {
    ...field,
    type: 'document_template',
    config: {
      ...DEFAULT_DOCUMENT_TEMPLATE_CONFIG,
      ...existing,
    },
  };
}
