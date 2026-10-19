/** Single-select dropdown — Phase 10 Plan 10-05 (APP-SETTINGS-01). */

import React from 'react';
import type { WidgetProps } from './index';

const SELECT_CLASS =
  'w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] ' +
  'px-3 py-2 text-sm text-[var(--text)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)] ' +
  'disabled:opacity-60';

export function SelectWidget(props: WidgetProps) {
  const { name, schema, value, onChange, required, disabled } = props;
  const options = (schema.enum as unknown[] | undefined) || [];
  const stringValue = value == null ? '' : String(value);
  return (
    <select
      id={`app-settings-field-${name}`}
      value={stringValue}
      onChange={e => onChange(e.target.value)}
      required={required}
      disabled={disabled}
      className={SELECT_CLASS}
      data-testid={`widget-select-${name}`}
    >
      {!required && <option value="">(none)</option>}
      {/* Required select with no value yet: render a disabled placeholder so
          the native control can't silently display the first enum option
          while the bound value stays '' (which submits nothing and fails
          required-field validation). Seeding usually prevents this, but this
          guarantees the shown state always matches the bound value. */}
      {required && stringValue === '' && (
        <option value="" disabled>
          Select…
        </option>
      )}
      {options.map((opt, i) => {
        const optString = String(opt);
        return (
          <option key={`${optString}-${i}`} value={optString}>
            {optString}
          </option>
        );
      })}
    </select>
  );
}
