/**
 * Phase 16 ACC-08 — register builtin field-type widgets that the
 * native SeamlessField dispatch does not handle.
 *
 * SeamlessField renders text/number/date/select/relation/file/markdown
 * inline; anything outside that set falls through to ``MissingFieldType``
 * unless a registered renderer is found via ``resolveFieldType``. The
 * `member` field type is the first such case — ACC-08 adds it to
 * the substrate, but its UI lives in a dedicated React component
 * (``MemberField``) rather than as another branch inside SeamlessField.
 *
 * Importing this module triggers the registration as a side-effect. The
 * field-types public surface (``./index``) re-exports it; ``SeamlessField``
 * imports from ``./index`` so the builtin lands at module-load time.
 */

import { registerFieldType } from './registry';
import { memberFieldRegistration } from './MemberField';
import { checklistFieldRegistration } from './ChecklistField';
import { documentTemplateFieldRegistration } from './DocumentTemplateField';

// The registry's ``Map.set`` is idempotent (re-registering overwrites);
// this module-load side effect lands ``member`` on first import and is
// safe to re-import after a test reset via
// ``_resetFieldTypeRegistryForTests``.
registerFieldType(memberFieldRegistration);
registerFieldType(checklistFieldRegistration);
registerFieldType(documentTemplateFieldRegistration);
