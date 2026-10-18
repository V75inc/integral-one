import { useDraggable } from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { format } from 'date-fns';
import type { Entry } from '../../types';
import { calendarDropId } from './calendarUtils';
import { LINE_ICON_STROKE } from '../ui/IconWell';

const ENTRY_CLASS =
  'bg-[var(--panel-2)] text-[var(--text)] border border-[var(--panel-border)]';

export function CalendarDraggableEntry({
  entry,
  draggable,
  onOpen,
  compact = false,
}: {
  entry: Entry;
  draggable: boolean;
  onOpen: (entry: Entry) => void;
  compact?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
    disabled: !draggable,
  });

  const style = draggable
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
      }
    : undefined;

  const handleClick = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.stopPropagation();
    onOpen(entry);
  };

  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      onClick={handleClick}
      className={[
        'w-full text-left rounded truncate transition-opacity hover:opacity-80',
        compact ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1',
        ENTRY_CLASS,
        draggable
          ? 'cursor-grab active:cursor-grabbing touch-none select-none'
          : '',
        isDragging ? 'ring-1 ring-[var(--brand-accent)]/40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {entry.title || 'Untitled'}
    </button>
  );
}

export function CalendarDropTarget({
  day,
  hour,
  isEditor,
  canAdd,
  onAdd,
  isDragging,
  className = '',
  children,
}: {
  day: Date;
  hour?: number;
  isEditor: boolean;
  canAdd: boolean;
  onAdd: (day: Date, hour?: number) => void;
  isDragging: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const dropId = calendarDropId(day, hour);
  const { setNodeRef, isOver } = useDroppable({ id: dropId });

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canAdd || isDragging) return;
    onAdd(day, hour);
  };

  return (
    <div
      ref={setNodeRef}
      className={[
        className,
        'relative group/cell transition-colors',
        isOver ? 'bg-[var(--link)]/10 ring-1 ring-inset ring-[var(--link)]/30' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
      {isEditor && canAdd && !isDragging ? (
        <button
          type="button"
          onClick={handleAdd}
          aria-label={`Add entry on ${format(day, 'PPP')}${hour != null ? ` at ${format(new Date().setHours(hour), 'h a')}` : ''}`}
          className="
            absolute top-1 right-1 z-[1]
            inline-flex h-5 w-5 items-center justify-center rounded
            text-[var(--text-muted)] opacity-0
            group-hover/cell:opacity-100
            hover:bg-[var(--panel)] hover:text-[var(--link)]
            transition-opacity
          "
        >
          <Plus size={12} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function CalendarDragOverlayCard({ entry }: { entry: Entry }) {
  return (
    <div
      className={`max-w-[12rem] text-xs px-1.5 py-0.5 rounded truncate shadow-md ${ENTRY_CLASS}`}
    >
      {entry.title || 'Untitled'}
    </div>
  );
}
