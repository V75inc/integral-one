/**
 * Widget registry for AppSettingsForm — Phase 10 Plan 10-05 (APP-SETTINGS-01).
 *
 * 9 widget kinds per app_bundles_v1.md §7.3:
 *   text | textarea | select | multi_select | boolean
 *   entry_picker | tag_picker | number | date | password | secret
 *
 * Each widget receives ``{name, schema, value, onChange, required, disabled,
 * uiHints}`` props (see ``WidgetProps`` below). Unknown widgets fall back
 * to the text widget — keeps the form forward-compatible with future v1.x
 * widget kinds.
 */

import React from 'react';
import { TextWidget } from './TextWidget';
import { TextareaWidget } from './TextareaWidget';
import { SelectWidget } from './SelectWidget';
import { MultiSelectWidget } from './MultiSelectWidget';
import { BooleanWidget } from './BooleanWidget';
import { EntryPickerWidget } from './EntryPickerWidget';
import { TagPickerWidget } from './TagPickerWidget';
import { NumberWidget } from './NumberWidget';
import { DateWidget } from './DateWidget';
import { PasswordWidget } from './PasswordWidget';

export type WidgetKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multi_select'
  | 'boolean'
  | 'entry_picker'
  | 'tag_picker'
  | 'number'
  | 'date'
  | 'password'
  | 'secret';

export interface JsonSchema {
  type?: string;
  enum?: unknown[];
  default?: unknown;
  title?: string;
  description?: string;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  format?: string;
  // ui:* extensions per app_bundles_v1.md §7.3
  'ui:widget'?: string;
  'ui:filters'?: Record<string, unknown>;
  'ui:placeholder'?: string;
  [k: string]: unknown;
}

export interface UiHints {
  widget: WidgetKind;
  filters: Record<string, unknown>;
  placeholder?: string;
}

export interface WidgetProps {
  name: string;
  schema: JsonSchema;
  value: unknown;
  required: boolean;
  disabled: boolean;
  onChange(next: unknown): void;
  uiHints: UiHints;
}

export const WIDGETS: Record<WidgetKind, React.FC<WidgetProps>> = {
  text: TextWidget,
  textarea: TextareaWidget,
  select: SelectWidget,
  multi_select: MultiSelectWidget,
  boolean: BooleanWidget,
  entry_picker: EntryPickerWidget,
  tag_picker: TagPickerWidget,
  number: NumberWidget,
  date: DateWidget,
  password: PasswordWidget,
  secret: PasswordWidget,
};

export function dispatchWidget(
  props: WidgetProps,
  kind: WidgetKind,
): React.ReactElement {
  const Component = WIDGETS[kind] || WIDGETS.text;
  return <Component {...props} />;
}
