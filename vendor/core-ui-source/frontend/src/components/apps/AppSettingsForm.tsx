/**
 * AppSettingsForm — native JSON-Schema form renderer for App settings.
 *
 * Phase 10 Plan 10-05 (APP-SETTINGS-01). Resolves Architectural Decision 7
 * (Option A — native renderer; no react-jsonschema-form dependency).
 *
 * Supported widgets per app_bundles_v1.md §7.3:
 *   text | textarea | select | multi_select | boolean
 *   entry_picker | tag_picker | number | date | password | secret
 *
 * Widget dispatch precedence:
 *   1. JSON Schema's ``ui:widget`` extension (per spec).
 *   2. JSON Schema ``type`` fallback (object props → text; arrays → multi_select
 *      if items.enum present, else multi-text; etc.).
 *
 * Per Open Question 10 resolution: ``entry_picker`` + ``tag_picker`` widgets
 * are thin wrappers — for v1 they render searchable inputs that produce
 * id arrays. If the existing ``TagLookupControl`` component is suitable for
 * embedding the form can opt into it via ``ui:filters`` configuration.
 *
 * Native escaping (no ``dangerouslySetInnerHTML``) — T-10-05-10 mitigation.
 */

import React from 'react';
import type { JsonSchema, UiHints, WidgetKind, WidgetProps } from './widgets';
import { dispatchWidget } from './widgets';

export interface AppSettingsFormProps {
  /** JSON Schema fragment (root is normally a ``type: object`` with ``properties``). */
  schema: JsonSchema;
  /** Current settings values. Controlled. */
  value: Record<string, unknown>;
  /** Called on every field change with the entire next settings dict. */
  onChange(next: Record<string, unknown>): void;
  /** Optional — disables all inputs (e.g. while submitting). */
  disabled?: boolean;
  /** Optional CSS class on the root container. */
  className?: string;
}

const FALLBACK_WIDGET_BY_TYPE: Record<string, WidgetKind> = {
  string: 'text',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  array: 'multi_select',
};

function resolveWidgetKind(propSchema: JsonSchema): WidgetKind {
  // 1. Explicit ui:widget hint wins (per app_bundles_v1.md §7.3).
  const hinted = propSchema['ui:widget'] as string | undefined;
  if (hinted && isKnownWidget(hinted)) return hinted;
  // 2. Format hint (date, etc.).
  if (propSchema.format === 'date') return 'date';
  // 3. Type fallback.
  const t = (propSchema.type as string | undefined) || '';
  return FALLBACK_WIDGET_BY_TYPE[t] || 'text';
}

function isKnownWidget(s: string): s is WidgetKind {
  return [
    'text',
    'textarea',
    'select',
    'multi_select',
    'boolean',
    'entry_picker',
    'tag_picker',
    'number',
    'date',
    'password',
    'secret',
  ].includes(s);
}

export function AppSettingsForm(props: AppSettingsFormProps) {
  const { schema, value, onChange, disabled = false, className = '' } = props;
  const properties = (schema.properties || {}) as Record<string, JsonSchema>;
  const required = (schema.required as string[] | undefined) || [];

  const propertyKeys = Object.keys(properties);
  if (propertyKeys.length === 0) {
    return (
      <div className="text-sm text-[var(--text-subtle)]">
        This App has no configurable settings.
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`} data-testid="app-settings-form">
      {propertyKeys.map(key => {
        const propSchema = properties[key];
        const widgetKind = resolveWidgetKind(propSchema);
        const uiHints: UiHints = {
          widget: widgetKind,
          filters: (propSchema['ui:filters'] || {}) as Record<string, unknown>,
          placeholder: propSchema['ui:placeholder'] as string | undefined,
        };
        const widgetProps: WidgetProps = {
          name: key,
          schema: propSchema,
          value: value[key],
          required: required.includes(key),
          disabled,
          onChange: (nextVal: unknown) =>
            onChange({ ...value, [key]: nextVal }),
          uiHints,
        };
        return (
          <div key={key} className="flex flex-col gap-1.5">
            <label
              htmlFor={`app-settings-field-${key}`}
              className="text-sm font-medium text-[var(--text)]"
            >
              {(propSchema.title as string | undefined) || key}
              {required.includes(key) && (
                <span className="ml-1 text-[var(--accent)]">*</span>
              )}
            </label>
            {dispatchWidget(widgetProps, widgetKind)}
            {propSchema.description && (
              <p className="text-xs text-[var(--text-subtle)]">
                {String(propSchema.description)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
