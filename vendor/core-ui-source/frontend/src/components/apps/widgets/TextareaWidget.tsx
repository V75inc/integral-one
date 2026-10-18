/** Multi-line text input — Phase 10 Plan 10-05 (APP-SETTINGS-01). */

import React from 'react';
import type { WidgetProps } from './index';

const TEXTAREA_CLASS =
  'w-full rounded-md border border-[var(--panel-border)] bg-[var(--panel)] ' +
  'px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)] ' +
  'disabled:opacity-60 min-h-[80px] resize-vertical';

export function TextareaWidget(props: WidgetProps) {
  const { name, value, onChange, required, disabled, uiHints } = props;
  const stringValue = value == null ? '' : String(value);
  return (
    <textarea
      id={`app-settings-field-${name}`}
      value={stringValue}
      onChange={e => onChange(e.target.value)}
      placeholder={uiHints.placeholder}
      required={required}
      disabled={disabled}
      className={TEXTAREA_CLASS}
      data-testid={`widget-textarea-${name}`}
    />
  );
}
