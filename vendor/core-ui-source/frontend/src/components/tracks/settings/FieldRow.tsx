import { GripVertical, Pencil, Trash2 } from 'lucide-react';
import type { OperationalModelFieldSpec } from '../../../types';
import { LINE_ICON_STROKE } from '../../ui';
import { BASE_FIELD_PREFIX } from './schemaFieldOrder';

interface FieldRowProps {
  field: OperationalModelFieldSpec;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}

export function FieldRow({ field, dragHandleProps, onEdit, onDelete, disabled }: FieldRowProps) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[var(--panel-2)] group">
      {dragHandleProps ? (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-[var(--text-muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring-color)]"
          aria-label={`Drag to reorder ${field.name}`}
          disabled={disabled}
          {...dragHandleProps}
        >
          <GripVertical size={14} strokeWidth={LINE_ICON_STROKE} />
        </button>
      ) : null}
      <span className="flex-1 min-w-0 truncate text-sm text-[var(--text)]" title={field.name}>
        {field.name}
      </span>
      <span className="text-[11px] px-1.5 py-0.5 rounded border border-[var(--panel-border)] text-[var(--text-muted)]">
        {field.type}
      </span>
      {field.required ? (
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-[var(--danger-bg)] text-[var(--danger-fg)]">
          required
        </span>
      ) : null}
      <button
        type="button"
        className="text-[var(--text-muted)] hover:text-[var(--text)] p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring-color)]"
        onClick={onEdit}
        disabled={disabled || field.key.startsWith(BASE_FIELD_PREFIX)}
        aria-label={`Edit field ${field.name}`}
      >
        <Pencil size={14} strokeWidth={LINE_ICON_STROKE} />
      </button>
      <button
        type="button"
        className="text-[var(--text-muted)] hover:text-[var(--danger-fg)] p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring-color)]"
        onClick={onDelete}
        disabled={disabled || field.key.startsWith(BASE_FIELD_PREFIX)}
        aria-label={`Delete field ${field.name}`}
      >
        <Trash2 size={14} strokeWidth={LINE_ICON_STROKE} />
      </button>
    </div>
  );
}
