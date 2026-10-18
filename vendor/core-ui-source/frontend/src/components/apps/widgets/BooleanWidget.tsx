import React from 'react';
import { Text } from '../../../ui/Text';
import type { WidgetProps } from './index';

export function BooleanWidget(props: WidgetProps) {
  const { name, value, onChange, disabled } = props;
  const boolValue = value === true;
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
      <input
        id={`app-settings-field-${name}`}
        type="checkbox"
        checked={boolValue}
        onChange={e => onChange(e.target.checked)}
        disabled={disabled}
        className="h-4 w-4 rounded border-[var(--panel-border)] text-[var(--accent)] focus:ring-[var(--focus-ring-color)]"
        data-testid={`widget-boolean-${name}`}
      />
      <Text variant="body" tone="default" as="span">
        {boolValue ? 'On' : 'Off'}
      </Text>
    </label>
  );
}
