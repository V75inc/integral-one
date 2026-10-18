/**
 * When a relation field declares ``validation.write_label_to``, copy the
 * selected choice's display label into that sibling field (strip a trailing
 * `` (Track title)`` suffix from relation pickers).
 *
 * Core primitive — Apps opt in via OM YAML; no domain field names here.
 */

import type { OperationalModelFieldSpec } from '../types';

export type RelationLabelChoice = { value: string; label: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stripTrackSuffix(label: string): string {
  return String(label || '')
    .replace(/\s*\([^)]*\)\s*$/u, '')
    .trim();
}

function relationId(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return relationId(value[0]);
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return String(o.id || o.entry_id || '').trim();
  }
  return String(value).trim();
}

export function deriveRelationLabelPatch(
  field: OperationalModelFieldSpec | undefined,
  value: unknown,
  choices: RelationLabelChoice[] = []
): Record<string, unknown> | null {
  if (!field || field.type !== 'relation') return null;
  const target = String(asRecord(field.validation)?.write_label_to || '').trim();
  if (!target) return null;

  const id = relationId(value);
  if (!id) {
    return { [target]: '' };
  }
  const choice = choices.find(c => String(c.value) === id);
  if (!choice) return null;
  const label = stripTrackSuffix(choice.label);
  if (!label) return null;
  return { [target]: label };
}
