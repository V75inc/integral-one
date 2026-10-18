/**
 * Public surface for the frontend field-type registry.
 *
 * Built-in primitives (text/number/etc.) are rendered by ``SeamlessField``'s
 * native dispatch — registering them here would duplicate logic. Plugins
 * and composite types can ``registerFieldType`` to override or extend.
 *
 * Phase 16 ACC-08 — ``member`` is the first field type that lives
 * outside SeamlessField's native set; its registration ships as a
 * module-load side effect of importing ``./builtins`` below, so any module
 * that imports the field-type surface (incl. SeamlessField itself) sees
 * ``member`` registered.
 */

import './builtins';

export {
  registerFieldType,
  getFieldType,
  listFieldTypes,
  resolveFieldType,
  fieldTypeRegistryVersion,
  _resetFieldTypeRegistryForTests,
} from './registry';
export type {
  FieldTypeRegistration,
  FieldTypeRendererProps,
  FieldTypeMeta,
  MissingFieldTypeInfo,
} from './types';
export { MissingFieldType } from './MissingFieldType';
export { memberFieldRegistration } from './MemberField';
export {
  checklistFieldRegistration,
  formatChecklistSummary,
} from './ChecklistField';
