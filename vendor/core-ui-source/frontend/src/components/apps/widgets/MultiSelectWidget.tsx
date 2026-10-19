/** Multi-select via chips — Phase 10 Plan 10-05 (APP-SETTINGS-01).
 *
 * Resolves an array-of-enum from ``schema.items.enum`` (per JSON Schema
 * convention). Selected options render as removable chips; unselected
 * options appear in a dropdown.
 */

import React from 'react';
import { X } from 'lucide-react';
import type { WidgetProps } from './index';

const CONTAINER_CLASS =
  'flex flex-wrap gap-1.5 rounded-md border border-[var(--panel-border)] ' +
  'bg-[var(--panel)] px-2 py-1.5 text-sm min-h-[40px]';

const SELECT_CLASS =
  'rounded-md border border-[var(--panel-border)] bg-[var(--panel)] ' +
  'px-2 py-1 text-xs text-[var(--text-subtle)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)] ' +
  'disabled:opacity-60';

const CHIP_CLASS =
  'inline-flex items-center gap-1 rounded-full bg-[var(--panel-2)] ' +
  'px-2 py-0.5 text-xs text-[var(--text)]';

export function MultiSelectWidget(props: WidgetProps) {
  const { name, schema, value, onChange, disabled } = props;
  const itemSchema = (schema.items as { enum?: unknown[] } | undefined) || {};
  const options = (itemSchema.enum as unknown[] | undefined) || [];
  const current = Array.isArray(value) ? (value as unknown[]).map(String) : [];
  const remaining = options.filter(o => !current.includes(String(o)));

  function addOption(opt: string) {
    if (!opt) return;
    if (current.includes(opt)) return;
    onChange([...current, opt]);
  }

  function removeOption(opt: string) {
    onChange(current.filter(o => o !== opt));
  }

  return (
    <div className="space-y-2" data-testid={`widget-multi_select-${name}`}>
      <div className={CONTAINER_CLASS}>
        {current.length === 0 && (
          <span className="text-[var(--text-subtle)] text-xs px-1 py-0.5">
            (none selected)
          </span>
        )}
        {current.map(opt => (
          <span key={opt} className={CHIP_CLASS}>
            {opt}
            {!disabled && (
              <button
                type="button"
                aria-label={`Remove ${opt}`}
                onClick={() => removeOption(opt)}
                className="text-[var(--text-subtle)] hover:text-[var(--text)]"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      {remaining.length > 0 && (
        <select
          id={`app-settings-field-${name}`}
          value=""
          onChange={e => addOption(e.target.value)}
          disabled={disabled}
          className={SELECT_CLASS}
          data-testid={`widget-multi_select-${name}-add`}
        >
          <option value="">+ add…</option>
          {remaining.map((opt, i) => {
            const optString = String(opt);
            return (
              <option key={`${optString}-${i}`} value={optString}>
                {optString}
              </option>
            );
          })}
        </select>
      )}
    </div>
  );
}
