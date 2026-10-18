import type { OperationalModelFieldSpec } from '../../types';

/** Visible required marker — matches the `Field` pattern asterisk. */
export function RequiredMarker() {
  return (
    <span aria-hidden className="ml-0.5 text-[var(--danger-fg)]">
      *
    </span>
  );
}

/** Field name with optional required asterisk for composer labels. */
export function FieldLabelContent({
  name,
  required = false,
}: {
  name: string;
  required?: boolean;
}) {
  return (
    <>
      {name}
      {required ? <RequiredMarker /> : null}
    </>
  );
}

export function isFieldRequired(field: OperationalModelFieldSpec): boolean {
  return Boolean(field.required);
}

/** Accessible label string for inputs (`aria-label`). */
export function fieldAriaLabel(field: OperationalModelFieldSpec): string {
  const name = field.name || field.key;
  return isFieldRequired(field) ? `${name} (required)` : name;
}
