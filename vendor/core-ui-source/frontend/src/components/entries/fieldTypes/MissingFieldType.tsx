/**
 * Fallback renderer used when a field's ``type`` is not in the field-type
 * registry AND has no built-in primitive dispatch path. Mirrors the
 * ``MissingWidget`` pattern from the view registry: shows a clear,
 * agent-friendly message instead of crashing the form.
 */

import type { OperationalModelFieldSpec } from '../../../types';

export interface MissingFieldTypeProps {
  field: OperationalModelFieldSpec;
  reason?: string;
}

export function MissingFieldType({ field, reason }: MissingFieldTypeProps) {
  return (
    <div
      role="alert"
      className="rounded-md border border-dashed border-[var(--panel-border)] bg-[var(--panel-2)] px-3 py-2 text-xs text-[var(--text-muted)]"
    >
      <p className="font-medium text-[var(--text)]">
        Field type "{field.type}" not installed
      </p>
      <p className="mt-1">
        {reason ||
          "This field uses a custom type that isn't registered in this client. Install the corresponding plugin or check the Operational Model support for this workspace."}
      </p>
    </div>
  );
}
