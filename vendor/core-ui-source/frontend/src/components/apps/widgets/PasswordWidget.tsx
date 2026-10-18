/** Masked secret input — write-only API keys and similar App settings. */

import React from 'react';
import type { WidgetProps } from './index';
import { Input } from '../../../ui';

export function PasswordWidget(props: WidgetProps) {
  const { name, value, onChange, required, disabled, uiHints } = props;
  const stringValue = value == null ? '' : String(value);
  return (
    <Input
      id={`app-settings-field-${name}`}
      type="password"
      value={stringValue}
      onChange={e => onChange(e.target.value)}
      placeholder={uiHints.placeholder}
      required={required}
      disabled={disabled}
      autoComplete="off"
      className="w-full"
      data-testid={`widget-password-${name}`}
    />
  );
}
