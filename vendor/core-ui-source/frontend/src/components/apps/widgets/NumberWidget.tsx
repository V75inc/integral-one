/** Numeric input — Phase 10 Plan 10-05 (APP-SETTINGS-01).
 *
 * Honors JSON Schema ``minimum`` / ``maximum`` / ``multipleOf`` on the
 * input element. The widget emits a number (or undefined when the input
 * is cleared); callers handle the undefined case via the schema's
 * required flag.
 */

import React from 'react';
import type { WidgetProps } from './index';

const INPUT_CLASS =
  'w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] ' +
  'px-3 py-2 text-sm text-[var(--text)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)] ' +
  'disabled:opacity-60';

export function NumberWidget(props: WidgetProps) {
  const { name, schema, value, onChange, required, disabled, uiHints } = props;
  const numValue = typeof value === 'number' ? value : '';
  const min = (schema.minimum as number | undefined);
  const max = (schema.maximum as number | undefined);
  const step = (schema.multipleOf as number | undefined) || (
    schema.type === 'integer' ? 1 : undefined
  );
  return (
    <input
      id={`app-settings-field-${name}`}
      type="number"
      value={numValue}
      onChange={e => {
        const raw = e.target.value;
        if (raw === '') {
          onChange(undefined);
          return;
        }
        const parsed = Number(raw);
        if (!Number.isNaN(parsed)) {
          onChange(parsed);
        }
      }}
      min={min}
      max={max}
      step={step}
      placeholder={uiHints.placeholder}
      required={required}
      disabled={disabled}
      className={INPUT_CLASS}
      data-testid={`widget-number-${name}`}
    />
  );
}
