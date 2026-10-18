/** Tag-id picker — Phase 10 Plan 10-05 (APP-SETTINGS-01).
 *
 * Mirrors ``EntryPickerWidget``'s shape: free-text chip-style input over
 * tag ids. Future work: surface the existing ``TagLookupControl`` if the
 * form has access to the workspace's selectable-tags list at render time
 * (the App settings page typically does — installer flow does not, since
 * the App's Tracks may not yet exist when the form is shown).
 *
 * ``ui:filters`` (per spec):
 *   - ``track_key`` — scope to tags on a named track
 *   - ``namespace``  — filter to tags in a named namespace (forward-compat)
 */

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { WidgetProps } from './index';

const CONTAINER_CLASS =
  'flex flex-wrap gap-1.5 rounded-md border border-[var(--panel-border)] ' +
  'bg-[var(--panel)] px-2 py-1.5 text-sm min-h-[40px]';

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-[var(--panel-2)] ' +
  'px-2 py-0.5 text-xs text-[var(--text)]';

const ADD_CLASS =
  'flex-1 min-w-[8rem] bg-transparent text-xs text-[var(--text)] ' +
  'placeholder:text-[var(--text-subtle)] focus:outline-none px-1';

export function TagPickerWidget(props: WidgetProps) {
  const { name, value, onChange, disabled, uiHints } = props;
  const [draft, setDraft] = useState('');
  const tags = Array.isArray(value) ? (value as unknown[]).map(String) : [];

  function addTag(t: string) {
    const trimmed = t.trim();
    if (!trimmed) return;
    if (tags.includes(trimmed)) {
      setDraft('');
      return;
    }
    onChange([...tags, trimmed]);
    setDraft('');
  }

  function removeTag(t: string) {
    onChange(tags.filter(x => x !== t));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="space-y-1" data-testid={`widget-tag_picker-${name}`}>
      <div className={CONTAINER_CLASS}>
        {tags.map(t => (
          <span key={t} className={CHIP_CLASS}>
            {t}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${t}`}
                onClick={() => removeTag(t)}
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
          onBlur={() => draft && addTag(draft)}
          placeholder={uiHints.placeholder || 'Add tag…'}
          disabled={disabled}
          className={ADD_CLASS}
          data-testid={`widget-tag_picker-${name}-input`}
        />
      </div>
      {Boolean(uiHints.filters.track_key) && (
        <p className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)]">
          Track: {String(uiHints.filters.track_key)}
        </p>
      )}
    </div>
  );
}
