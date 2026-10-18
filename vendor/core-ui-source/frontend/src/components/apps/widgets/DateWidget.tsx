/** Date picker — Phase 10 Plan 10-05 (APP-SETTINGS-01).
 *
 * Emits ISO 8601 ``YYYY-MM-DD`` strings (or empty string when cleared).
 */

import React from 'react';
import { DatePicker } from '../../ui/DatePicker';
import type { WidgetProps } from './index';

export function DateWidget(props: WidgetProps) {
  const { name, value, onChange, disabled, uiHints } = props;
  const stringValue = value == null ? '' : String(value);
  return (
    <DatePicker
      id={`app-settings-field-${name}`}
      mode="date"
      value={stringValue}
      onChange={v => onChange(v)}
      disabled={disabled}
      placeholder={uiHints.placeholder}
      variant="field"
      data-testid={`widget-date-${name}`}
      className="w-full"
    />
  );
}
