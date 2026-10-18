/**
 * Checklist field widget — Planner-style checkbox list stored as JSON:
 * `[{ "text": string, "done": boolean }]`.
 */

import { Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { IconButton, Input, Surface, Text } from '../../../ui';
import type { FieldTypeRegistration, FieldTypeRendererProps } from './types';
import {
  FieldLabelContent,
  fieldAriaLabel,
  isFieldRequired,
} from '../fieldLabel';

export type ChecklistItem = { text: string; done: boolean };

/** Persist / summary shape — drop blank rows. */
function normalizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const text = String(row.text ?? '').trim();
      if (!text) return null;
      return { text, done: Boolean(row.done) };
    })
    .filter((x): x is ChecklistItem => x !== null);
}

/** Editor shape — keep blank draft rows so "Add item" is not a no-op. */
function parseChecklistForEditor(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        text: String(row.text ?? ''),
        done: Boolean(row.done),
      };
    })
    .filter((x): x is ChecklistItem => x !== null);
}

function ChecklistFieldEditor({ field, value, onChange }: FieldTypeRendererProps) {
  const items = useMemo(() => parseChecklistForEditor(value), [value]);
  const required = isFieldRequired(field);
  const readonly = Boolean(field.readonly);

  const updateItems = (next: ChecklistItem[]) => {
    // Keep drafts (including empty text) in the live value so new rows render;
    // persistence paths / summaries still use normalizeChecklist.
    onChange(next.length ? next : null);
  };

  return (
    <Surface tone="panel" border="default" radius="input" padding="sm">
      <div aria-required={required || undefined}>
        <Text as="div" variant="label" tone="muted" className="mb-2">
          <FieldLabelContent name={field.name} required={required} />
        </Text>
        {items.length === 0 && readonly ? (
          <Text as="p" variant="body-sm" tone="subtle" className="italic">
            No checklist items
          </Text>
        ) : (
          <ul className="space-y-1.5">
            {items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={readonly}
                  aria-label={
                    item.text.trim()
                      ? `Mark "${item.text}" ${item.done ? 'incomplete' : 'complete'}`
                      : `Mark checklist item ${idx + 1} ${item.done ? 'incomplete' : 'complete'}`
                  }
                  onChange={e => {
                    const next = items.map((row, i) =>
                      i === idx ? { ...row, done: e.target.checked } : row
                    );
                    updateItems(next);
                  }}
                  className="mt-0.5 accent-[var(--brand-accent)]"
                />
                <Input
                  type="text"
                  size="sm"
                  value={item.text}
                  disabled={readonly}
                  placeholder="Checklist item"
                  aria-label={fieldAriaLabel(field)}
                  onChange={e => {
                    const next = items.map((row, i) =>
                      i === idx ? { ...row, text: e.target.value } : row
                    );
                    updateItems(next);
                  }}
                  onBlur={() => {
                    // Drop blank rows once the user leaves them empty.
                    if (!item.text.trim()) {
                      updateItems(items.filter((_, i) => i !== idx));
                    }
                  }}
                  className="min-w-0 flex-1"
                />
                {!readonly ? (
                  <IconButton
                    type="button"
                    size="sm"
                    tone="subtle"
                    label={
                      item.text.trim()
                        ? `Remove "${item.text}"`
                        : `Remove checklist item ${idx + 1}`
                    }
                    onClick={() => updateItems(items.filter((_, i) => i !== idx))}
                    className="mt-0.5"
                  >
                    <Trash2 size={14} aria-hidden />
                  </IconButton>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {!readonly ? (
          <button
            type="button"
            onClick={() => updateItems([...items, { text: '', done: false }])}
            className="mt-2 inline-flex items-center gap-1"
          >
            <Plus size={14} aria-hidden />
            <Text as="span" variant="meta" tone="muted">
              Add item
            </Text>
          </button>
        ) : null}
      </div>
    </Surface>
  );
}

export const checklistFieldRegistration: FieldTypeRegistration = {
  type: 'checklist',
  editor: ChecklistFieldEditor,
  meta: {
    label: 'Checklist',
    description: 'Checkbox list stored as JSON',
  },
};

/** Read-only checklist summary for detail meta rows. */
export function formatChecklistSummary(value: unknown): string | null {
  const items = normalizeChecklist(value);
  if (!items.length) return null;
  const done = items.filter(i => i.done).length;
  return `${done}/${items.length} complete`;
}

export { normalizeChecklist, parseChecklistForEditor };
