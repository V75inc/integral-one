import type { Entry } from '../types';

/**
 * Stable field-path resolver for the legacy Entry transport shape.
 *
 * The API's information contract reserves platform attributes at the Entry
 * top level and stores business fields in `custom_fields`. A fully-qualified
 * `custom_fields.<key>` path always addresses the business namespace, even
 * when the value is null. Bare platform keys always address the platform
 * namespace. Bare unknown keys retain compatibility with older saved views
 * and address the business namespace.
 */
export const PLATFORM_ENTRY_FIELD_KEYS = new Set([
  'id',
  'title',
  'body',
  'status',
  'type',
  'type_id',
  'author_id',
  'track_id',
  'created_at',
  'updated_at',
]);

type EntryValues = Entry | Record<string, unknown>;

function customFieldValues(entry: EntryValues): Record<string, unknown> {
  const customFields = (entry as Record<string, unknown>).custom_fields;
  return customFields && typeof customFields === 'object'
    ? customFields as Record<string, unknown>
    : {};
}

/** Resolve a platform or business field without value-dependent fallback. */
export function resolveEntryFieldValue(entry: EntryValues, fieldPath: string): unknown {
  if (!fieldPath) return undefined;

  if (fieldPath.startsWith('custom_fields.')) {
    return customFieldValues(entry)[fieldPath.slice('custom_fields.'.length)];
  }

  if (PLATFORM_ENTRY_FIELD_KEYS.has(fieldPath)) {
    return (entry as Record<string, unknown>)[fieldPath];
  }

  return customFieldValues(entry)[fieldPath];
}
