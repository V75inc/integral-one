import { useState } from 'react';
import { ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { EntryTypeNode, OperationalModelFieldSpec } from '../../../types';
import { orderedSchemaFields } from './schemaFieldOrder';
import { LINE_ICON_STROKE } from '../../ui';
import { FieldList } from './FieldList';

interface EntryTypeCardProps {
  entryType: EntryTypeNode;
  onReorder: (fields: OperationalModelFieldSpec[]) => void;
  onEditField: (key: string) => void;
  onDeleteField: (key: string) => void;
  onAddField: () => void;
  onDeleteEntryType?: () => void;
  disabled?: boolean;
}

export function EntryTypeCard({
  entryType,
  onReorder,
  onEditField,
  onDeleteField,
  onAddField,
  onDeleteEntryType,
  disabled,
}: EntryTypeCardProps) {
  const [open, setOpen] = useState(false);
  const fields = orderedSchemaFields(entryType.form_schema);

  return (
    <div className="app-card group/etc">
      <div className="flex min-h-9 w-full items-center gap-2 px-3 py-1">
        <button
          type="button"
          className="flex-1 h-full flex items-center gap-2 min-w-0 text-left"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-label={`Toggle ${entryType.name} fields`}
        >
          {open ? (
            <ChevronDown size={14} strokeWidth={LINE_ICON_STROKE} />
          ) : (
            <ChevronRight size={14} strokeWidth={LINE_ICON_STROKE} />
          )}
          <span className="min-w-0 truncate text-[13px] font-medium capitalize text-[var(--text)]">
            {entryType.name}
          </span>
          <span className="shrink-0 whitespace-nowrap text-[11px] text-[var(--text-muted)]">
            {fields.length} field{fields.length === 1 ? '' : 's'}
          </span>
        </button>
        {onDeleteEntryType && (
          <button
            type="button"
            onClick={onDeleteEntryType}
            disabled={disabled}
            aria-label={`Delete entry type ${entryType.name}`}
            title={`Delete entry type "${entryType.name}"`}
            className="opacity-0 group-hover/etc:opacity-100 focus-visible:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--danger-fg)] hover:bg-[var(--panel-2)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Trash2 size={13} strokeWidth={LINE_ICON_STROKE} />
          </button>
        )}
      </div>
      {open ? (
        <div className="px-4 pb-3 pt-1 border-t border-[var(--panel-border)]">
          <FieldList
            fields={fields}
            onReorder={onReorder}
            onEditField={onEditField}
            onDeleteField={onDeleteField}
            onAddField={onAddField}
            disabled={disabled}
          />
        </div>
      ) : null}
    </div>
  );
}
