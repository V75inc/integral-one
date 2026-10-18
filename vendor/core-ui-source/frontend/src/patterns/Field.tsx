/**
 * Field — form-row pattern.
 *
 * Bundles label + optional hint + control + optional error into a
 * single typed composition. Replaces hand-rolled
 * `<label>` + `<input>` + `<span class="text-xs ...">` triplets across
 * settings, dialogs, and entry forms (30+ drift sites per INVENTORY §6).
 *
 * Generalizes the existing `features/settings/components/Field.tsx`
 * `SettingsField` — that wrapper now delegates here.
 *
 * Layer: Pattern (Layer 2 — composes Primitive `<Text>`).
 *
 * Usage:
 *   <Field label="Name" hint="Shown on your profile" required>
 *     <input ... />   // (until <Input> ships in Phase 3-A slice B)
 *   </Field>
 *
 *   <Field label="API key" inline error={validationErr}>
 *     <Switch ... />
 *   </Field>
 */

import { cloneElement, isValidElement, type ReactNode, type ReactElement, useId } from 'react';

import { Text } from '../ui';

export interface FieldProps {
  /** The visible label text. */
  label: ReactNode;
  /** Helper / description text below the label. */
  hint?: ReactNode;
  /** Validation error text below the control. */
  error?: ReactNode;
  /**
   * Lay the row out as label-on-left, control-on-right (good for
   * toggles + selects). Default: stacked.
   */
  inline?: boolean;
  /**
   * Mark this field as required. Appends an `*` to the label and sets
   * `aria-required` on a single child control.
   */
  required?: boolean;
  /**
   * `id` for the wrapped control. When set, the `<label>` is rendered
   * with `htmlFor={id}` for proper a11y. Otherwise a generated ID associates
   * the label with a single child control.
   */
  htmlFor?: string;
  /** The form control (input, select, switch, textarea, …). */
  children: ReactNode;
}

export function Field({
  label,
  hint,
  error,
  inline = false,
  required = false,
  htmlFor,
  children,
}: FieldProps) {
  // Generate a fallback id so error/hint can be associated via
  // `aria-describedby` even when the caller didn't pass `htmlFor`.
  const fallbackId = useId();
  const labelId = `${htmlFor ?? fallbackId}-label`;
  const hintId = hint ? `${htmlFor ?? fallbackId}-hint` : undefined;
  const errorId = error ? `${htmlFor ?? fallbackId}-error` : undefined;

  const wrapperClass = inline
    ? 'flex flex-row items-center justify-between gap-4'
    : 'flex flex-col gap-1.5';
  const labelGroupClass = inline
    ? 'flex flex-col gap-0.5 min-w-0 flex-1'
    : 'flex flex-col gap-0.5';
  const controlClass = inline ? 'shrink-0' : 'w-full';

  const child = isValidElement(children) ? children as ReactElement<Record<string, unknown>> : null;
  const controlId = htmlFor ?? (child?.props.id as string | undefined) ?? fallbackId;
  const describedBy = [child?.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = child ? cloneElement(child, {
    id: controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : child.props['aria-invalid'],
    'aria-required': required || child.props['aria-required'],
  }) : children;

  return (
    <div className={wrapperClass}>
      <div className={labelGroupClass}>
        <Text variant="body" weight="medium" as="label" id={labelId} htmlFor={controlId}>
          {label}
          {required && <span aria-hidden className="ml-0.5 text-[var(--danger-fg)]">*</span>}
        </Text>
        {hint && <Text variant="body-sm" tone="subtle" as="span" id={hintId}>{hint}</Text>}
      </div>
      <div className={controlClass}>{control}</div>
      {error && <Text variant="body-sm" tone="danger" as="span" id={errorId}>{error}</Text>}
    </div>
  );
}
