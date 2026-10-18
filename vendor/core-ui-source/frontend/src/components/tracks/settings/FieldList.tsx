import { useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import type { OperationalModelFieldSpec } from '../../../types';
import { LINE_ICON_STROKE } from '../../ui';
import { FieldRow } from './FieldRow';

interface FieldListProps {
  fields: OperationalModelFieldSpec[];
  onReorder: (next: OperationalModelFieldSpec[]) => void;
  onEditField: (key: string) => void;
  onDeleteField: (key: string) => void;
  onAddField: () => void;
  disabled?: boolean;
}

function SortableFieldRow(props: {
  field: OperationalModelFieldSpec;
  onEdit: () => void;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.field.key, disabled: props.disabled });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <FieldRow
        field={props.field}
        dragHandleProps={{ ...attributes, ...listeners } as React.HTMLAttributes<HTMLButtonElement>}
        onEdit={props.onEdit}
        onDelete={props.onDelete}
        disabled={props.disabled}
      />
    </div>
  );
}

export function FieldList({
  fields,
  onReorder,
  onEditField,
  onDeleteField,
  onAddField,
  disabled,
}: FieldListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => fields.map(f => f.key), [fields]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (disabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex(f => f.key === active.id);
    const newIndex = fields.findIndex(f => f.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(fields, oldIndex, newIndex).map((f, i) => ({ ...f, order: i }));
    onReorder(reordered);
  };

  return (
    <div className="space-y-0.5">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {fields.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] py-2 px-2">No fields yet.</p>
          ) : (
            fields.map(f => (
              <SortableFieldRow
                key={f.key}
                field={f}
                onEdit={() => onEditField(f.key)}
                onDelete={() => onDeleteField(f.key)}
                disabled={disabled}
              />
            ))
          )}
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--link)] hover:underline disabled:opacity-50"
        onClick={onAddField}
        disabled={disabled}
      >
        <Plus size={14} strokeWidth={LINE_ICON_STROKE} />
        Add field
      </button>
    </div>
  );
}
