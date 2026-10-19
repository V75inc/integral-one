/** Entry-id picker — Phase 10 Plan 10-05 (APP-SETTINGS-01).
 *
 * Resolves Open Question 10: rather than extracting a non-existent
 * RelationPicker (no such component currently ships — the relation field
 * UI is inlined in ``SeamlessField.tsx``), this widget implements a
 * lightweight controlled multi-id picker tailored to the App settings
 * form contract. The output is a list of Entry ids (the form's JSON value
 * shape per app_bundles_v1.md §7.1).
 *
 * ``ui:filters`` (per spec):
 *   - ``track_key``  — filter to entries on the named track
 *   - ``type_key``   — filter to entries of the named EntryType
 *   - ``tags_any``   — entries that carry any of the listed tags
 *
 * The widget does NOT call the backend at module load — it shows the
 * id-array as removable chips and exposes a free-text "add id" input.
 * A future plan can graft on the searchbox UI from the relation field
 * once that lives in a reusable component.
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { WidgetProps } from './index';

const CONTAINER_CLASS =
  'flex flex-wrap gap-1.5 rounded-md border border-[var(--panel-border)] ' +
  'bg-[var(--panel)] px-2 py-1.5 text-sm min-h-[40px]';

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-[var(--panel-2)] ' +
  'px-2 py-0.5 text-xs text-[var(--text)] font-mono';

const ADD_CLASS =
  'flex-1 min-w-[8rem] bg-transparent text-xs text-[var(--text)] ' +
  'placeholder:text-[var(--text-subtle)] focus:outline-none px-1';

export function EntryPickerWidget(props: WidgetProps) {
  const { name, value, onChange, disabled, uiHints } = props;
  const [draft, setDraft] = useState('');
  const ids = Array.isArray(value) ? (value as unknown[]).map(String) : [];

  function addId(id: string) {
    const trimmed = id.trim();
    if (!trimmed) return;
    if (ids.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...ids, trimmed]);
    setDraft('');
  }

  function removeId(id: string) {
    onChange(ids.filter(i => i !== id));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addId(draft);
    } else if (e.key === 'Backspace' && draft === '' && ids.length > 0) {
      // Quick-remove last chip.
      onChange(ids.slice(0, -1));
    }
  }

  const filterSummary: string[] = [];
  if (uiHints.filters.track_key) {
    filterSummary.push(`track:${String(uiHints.filters.track_key)}`);
  }
  if (uiHints.filters.type_key) {
    filterSummary.push(`type:${String(uiHints.filters.type_key)}`);
  }
  if (Array.isArray(uiHints.filters.tags_any)) {
    filterSummary.push(`tags:${(uiHints.filters.tags_any as unknown[]).join(',')}`);
  }

  return (
    <div className="space-y-1" data-testid={`widget-entry_picker-${name}`}>
      <div className={CONTAINER_CLASS}>
        {ids.map(id => (
          <span key={id} className={CHIP_CLASS}>
            {id}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${id}`}
                onClick={() => removeId(id)}
                className="text-[var(--text-subtle)] hover:text-[var(--text)]"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        <input
          id={`app-settings-field-${name}`}
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft && addId(draft)}
          placeholder={uiHints.placeholder || 'Add entry id…'}
          disabled={disabled}
          className={ADD_CLASS}
          data-testid={`widget-entry_picker-${name}-input`}
        />
      </div>
      {filterSummary.length > 0 && (
        <p className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
          Filters: {filterSummary.join(' · ')}
        </p>
      )}
    </div>
  );
}
