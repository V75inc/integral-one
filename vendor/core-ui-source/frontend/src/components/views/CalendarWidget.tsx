import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  pointerWithin
} from '@dnd-kit/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  getHours
} from 'date-fns';
import { markdownToPlainExcerpt } from '../../utils/markdownExcerpt';
import type { ViewWidgetProps } from './types';
import type { Entry } from '../../types';
import { CalendarDateNavigator } from './CalendarDateNavigator';
import { CalendarFilterStrip } from './CalendarFilterStrip';
import {
  CalendarDraggableEntry,
  CalendarDragOverlayCard,
  CalendarDropTarget
} from './CalendarDnD';
import {
  buildCreateInputForDate,
  filterCalendarEntries,
  getEntryDate,
  getEntryEndDate,
  inferDateFieldMode,
  isSchedulableCalendarField,
  moveEntryToDate,
  normalizeCalendarMapping,
  parseCalendarDropId,
  parseFilterDate,
  resolveCalendarCreateEntryTypeKey
} from './calendarUtils';
import { applyTimeToDate, toDateFieldStorage } from '../../utils/dateFieldValue';

const CALENDAR_ENTRY_CLASS =
  'bg-[var(--panel-2)] text-[var(--text)] border border-[var(--panel-border)]';

type CalendarViewMode = 'month' | 'week' | 'day';

function CalendarWidgetInner({
  entries,
  view,
  onEntryOpen,
  onEntryUpdate,
  onEntryPersist,
  onEntryCreate,
  onEntryEdit,
  isEditor,
  fields,
  entryTypes,
  trackDefaultEntryTypeKey
}: ViewWidgetProps) {
  const config = (view.config || {}) as Record<string, unknown>;
  const mapping = useMemo(
    () => normalizeCalendarMapping(config.calendar_mapping as Record<string, unknown>),
    [config.calendar_mapping]
  );
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const headerLabelRef = useRef<HTMLButtonElement>(null);

  const commitEntry = onEntryPersist || onEntryUpdate;
  const canSchedule = Boolean(
    isEditor &&
      isSchedulableCalendarField(mapping, entryTypes ?? [], fields)
  );
  const createEntryTypeKey = useMemo(
    () =>
      resolveCalendarCreateEntryTypeKey(
        view,
        entryTypes ?? [],
        mapping.date_field || 'created_at',
        trackDefaultEntryTypeKey
      ),
    [view, entryTypes, mapping.date_field, trackDefaultEntryTypeKey]
  );
  const canDrag = canSchedule && Boolean(commitEntry);
  const canAdd = canSchedule && Boolean(onEntryCreate) && Boolean(createEntryTypeKey);
  const dndEnabled = canDrag || canAdd;
  const isDragging = activeDragId != null;

  const filtersActive = Boolean(search.trim() || dateFrom || dateTo);

  const filteredEntries = useMemo(
    () =>
      filterCalendarEntries(entries, mapping, {
        search,
        dateFrom,
        dateTo
      }),
    [entries, mapping, search, dateFrom, dateTo]
  );

  useEffect(() => {
    const from = parseFilterDate(dateFrom);
    if (!from) return;
    setCurrentDate(prev => {
      if (viewMode === 'month' && isSameMonth(from, prev)) return prev;
      return from;
    });
  }, [dateFrom, viewMode]);

  const entriesByDate = useMemo(() => {
    const map: Map<string, Entry[]> = new Map();
    for (const entry of filteredEntries) {
      const startDate = getEntryDate(entry, mapping);
      if (!startDate) continue;

      const endDate = getEntryEndDate(entry, mapping);

      if (endDate) {
        let d = new Date(startDate);
        while (d <= endDate) {
          const key = format(d, 'yyyy-MM-dd');
          if (!map.has(key)) map.set(key, []);
          map.get(key)!.push(entry);
          d = addDays(d, 1);
        }
      } else {
        const key = format(startDate, 'yyyy-MM-dd');
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(entry);
      }
    }
    return map;
  }, [filteredEntries, mapping]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 }
    })
  );

  const activeDragEntry = useMemo(
    () => (activeDragId ? entries.find(e => e.id === activeDragId) ?? null : null),
    [activeDragId, entries]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      const { active, over } = event;
      if (!over || !commitEntry || !canDrag) return;

      const target = parseCalendarDropId(String(over.id));
      if (!target) return;

      const entry = entries.find(e => e.id === String(active.id));
      if (!entry) return;

      const patched = moveEntryToDate(entry, mapping, target.day, {
        hour: target.hour,
        fields
      });
      void commitEntry(patched);
    },
    [canDrag, commitEntry, entries, fields, mapping]
  );

  const handleDragCancel = () => setActiveDragId(null);

  const handleAddEntry = useCallback(
    async (day: Date, hour?: number) => {
      if (!onEntryCreate || !canAdd) return;
      const input = buildCreateInputForDate(day, mapping, fields);
      if (hour != null) {
        const field = mapping.date_field || 'created_at';
        const mode = inferDateFieldMode(null, field, fields);
        if (mode === 'datetime') {
          input.custom_fields = {
            ...(input.custom_fields || {}),
            [field]: toDateFieldStorage(applyTimeToDate(day, hour, 0), mode)
          };
        }
      }
      const created = await onEntryCreate({
        ...input,
        source: 'calendar',
        type: createEntryTypeKey
      });
      if (!created) return;
      if (onEntryEdit) onEntryEdit(created);
      else onEntryOpen(created);
    },
    [canAdd, createEntryTypeKey, fields, mapping, onEntryCreate, onEntryEdit, onEntryOpen]
  );

  const navigate = useCallback(
    (dir: number) => {
      if (viewMode === 'month') {
        setCurrentDate(d => (dir > 0 ? addMonths(d, 1) : subMonths(d, 1)));
      } else if (viewMode === 'week') {
        setCurrentDate(d => (dir > 0 ? addWeeks(d, 1) : subWeeks(d, 1)));
      } else {
        setCurrentDate(d => (dir > 0 ? addDays(d, 1) : subDays(d, 1)));
      }
    },
    [viewMode]
  );

  const goToToday = () => setCurrentDate(new Date());

  const headerLabel = useMemo(() => {
    if (viewMode === 'month') return format(currentDate, 'MMMM yyyy');
    if (viewMode === 'week') {
      const start = startOfWeek(currentDate);
      const end = endOfWeek(currentDate);
      return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
    }
    return format(currentDate, 'EEEE, MMMM d, yyyy');
  }, [currentDate, viewMode]);

  const dropProps = {
    isEditor: Boolean(isEditor),
    canAdd,
    onAdd: handleAddEntry,
    isDragging
  };

  const renderEntryChip = (entry: Entry, compact = true) =>
    dndEnabled ? (
      <CalendarDraggableEntry
        key={entry.id}
        entry={entry}
        draggable={canDrag}
        onOpen={onEntryOpen}
        compact={compact}
      />
    ) : (
      <button
        key={entry.id}
        type="button"
        onClick={() => onEntryOpen(entry)}
        className={`w-full text-left text-xs px-1.5 py-0.5 rounded truncate ${CALENDAR_ENTRY_CLASS} hover:opacity-80 transition-opacity`}
      >
        {entry.title || 'Untitled'}
      </button>
    );

  const renderMonthView = () => {
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    const days = eachDayOfInterval({ start, end });

    return (
      <div>
        <div className="grid grid-cols-7 border-b border-[var(--panel-border)]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div
              key={day}
              className="px-1 sm:px-2 py-2 text-center text-[10px] sm:text-xs font-semibold text-[var(--text-muted)] uppercase"
            >
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.charAt(0)}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(day => {
            const key = format(day, 'yyyy-MM-dd');
            const dayEntries = entriesByDate.get(key) || [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isTodayDate = isToday(day);

            const cellInner = (
              <>
                {canAdd ? (
                  <button
                    type="button"
                    onClick={() => handleAddEntry(day)}
                    title={`Add entry on ${format(day, 'PPP')}`}
                    className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                      isTodayDate
                        ? 'bg-[var(--link)] text-white font-bold hover:bg-[var(--link-hover)]'
                        : isCurrentMonth
                        ? 'text-[var(--text)] hover:bg-[var(--panel-2)]'
                        : 'text-[var(--text-muted)] opacity-50 hover:opacity-100 hover:bg-[var(--panel-2)]'
                    }`}
                  >
                    {format(day, 'd')}
                  </button>
                ) : (
                  <div
                    className={`text-xs mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                      isTodayDate
                        ? 'bg-[var(--link)] text-white font-bold'
                        : isCurrentMonth
                        ? 'text-[var(--text)]'
                        : 'text-[var(--text-muted)] opacity-50'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                )}
                <div className="space-y-0.5">
                  {dayEntries.slice(0, 3).map(entry => renderEntryChip(entry))}
                  {dayEntries.length > 3 && (
                    <div className="text-xs text-[var(--text-muted)] pl-1">
                      +{dayEntries.length - 3} more
                    </div>
                  )}
                </div>
              </>
            );

            return dndEnabled ? (
              <CalendarDropTarget
                key={key}
                day={day}
                {...dropProps}
                className={`min-h-[64px] sm:min-h-[80px] border-b border-r border-[var(--panel-border)] p-1 ${
                  !isCurrentMonth ? 'bg-[var(--panel-2)]/30' : ''
                }`}
              >
                {cellInner}
              </CalendarDropTarget>
            ) : (
              <div
                key={key}
                className={`min-h-[64px] sm:min-h-[80px] border-b border-r border-[var(--panel-border)] p-1 ${
                  !isCurrentMonth ? 'bg-[var(--panel-2)]/30' : ''
                }`}
              >
                {cellInner}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const start = startOfWeek(currentDate);
    const days = eachDayOfInterval({ start, end: endOfWeek(currentDate) });
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="overflow-x-auto">
        <div className="grid grid-cols-8 border-b border-[var(--panel-border)]">
          <div className="px-2 py-2 text-xs font-semibold text-[var(--text-muted)]" />
          {days.map(day => (
            <div
              key={format(day, 'yyyy-MM-dd')}
              className={`px-2 py-2 text-center text-xs font-semibold ${
                isToday(day) ? 'text-[var(--link)]' : 'text-[var(--text)]'
              }`}
            >
              <div>{format(day, 'EEE')}</div>
              {canAdd ? (
                <button
                  type="button"
                  onClick={() => handleAddEntry(day)}
                  className="text-lg hover:underline"
                  title={`Add entry on ${format(day, 'PPP')}`}
                >
                  {format(day, 'd')}
                </button>
              ) : (
                <div className="text-lg">{format(day, 'd')}</div>
              )}
            </div>
          ))}
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {hours.map(hour => (
            <div
              key={hour}
              className="grid grid-cols-8 border-b border-[var(--panel-border)] min-h-[40px]"
            >
              <div className="px-2 py-1 text-xs text-[var(--text-muted)] border-r border-[var(--panel-border)]">
                {format(new Date().setHours(hour), 'h a')}
              </div>
              {days.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const hourEntries = (entriesByDate.get(key) || []).filter(e => {
                  const d = getEntryDate(e, mapping);
                  return d && getHours(d) === hour;
                });

                const slot = (
                  <div className="space-y-0.5">
                    {hourEntries.map(entry => renderEntryChip(entry))}
                  </div>
                );

                return dndEnabled ? (
                  <CalendarDropTarget
                    key={`${key}-${hour}`}
                    day={day}
                    hour={hour}
                    {...dropProps}
                    className="px-1 py-0.5 border-r border-[var(--panel-border)] min-h-[40px]"
                  >
                    {slot}
                  </CalendarDropTarget>
                ) : (
                  <div
                    key={`${key}-${hour}`}
                    className="px-1 py-0.5 border-r border-[var(--panel-border)]"
                  >
                    {slot}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const key = format(currentDate, 'yyyy-MM-dd');
    const dayEntries = entriesByDate.get(key) || [];
    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="max-h-[600px] overflow-y-auto">
        {hours.map(hour => {
          const hourEntries = dayEntries.filter(e => {
            const d = getEntryDate(e, mapping);
            return d && getHours(d) === hour;
          });

          const slot = (
            <div className="flex-1 px-2 py-1">
              {hourEntries.map(entry =>
                dndEnabled ? (
                  <div key={entry.id} className="mb-1">
                    <CalendarDraggableEntry
                      entry={entry}
                      draggable={canDrag}
                      onOpen={onEntryOpen}
                      compact={false}
                    />
                    {entry.body ? (
                      <div className="text-xs opacity-80 truncate px-2">
                        {markdownToPlainExcerpt(entry.body, 160)}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onEntryOpen(entry)}
                    className={`w-full text-left text-sm px-2 py-1 rounded mb-1 ${CALENDAR_ENTRY_CLASS} hover:opacity-80`}
                  >
                    <div className="font-medium">{entry.title || 'Untitled'}</div>
                    {entry.body ? (
                      <div className="text-xs opacity-80 truncate">
                        {markdownToPlainExcerpt(entry.body, 160)}
                      </div>
                    ) : null}
                  </button>
                )
              )}
            </div>
          );

          return (
            <div
              key={hour}
              className="flex border-b border-[var(--panel-border)] min-h-[50px]"
            >
              <div className="w-20 px-3 py-2 text-xs text-[var(--text-muted)] border-r border-[var(--panel-border)] shrink-0">
                {format(new Date().setHours(hour), 'h a')}
              </div>
              {dndEnabled ? (
                <CalendarDropTarget
                  day={currentDate}
                  hour={hour}
                  {...dropProps}
                  className="flex-1 min-w-0"
                >
                  {slot}
                </CalendarDropTarget>
              ) : (
                slot
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const emptyMessage = useMemo(() => {
    if (entries.length === 0 && !canAdd) {
      return 'No entries with dates to display.';
    }
    if (filtersActive && filteredEntries.length === 0) {
      return 'No entries match your search or date filters.';
    }
    if (filteredEntries.length === 0 && canAdd) {
      return 'No entries on the calendar yet. Click a date or drag entries here to schedule them.';
    }
    return null;
  }, [entries.length, filtersActive, filteredEntries.length, canAdd]);

  const calendarBody = (
    <>
      {emptyMessage ? (
        <div className="px-3 md:px-4 py-2 text-xs text-[var(--text-subtle)] border-b border-[var(--panel-border)]">
          {emptyMessage}
        </div>
      ) : null}
      {viewMode === 'month' && renderMonthView()}
      {viewMode === 'week' && renderWeekView()}
      {viewMode === 'day' && renderDayView()}
    </>
  );

  return (
    <div className="bg-[var(--panel)] rounded-lg border border-[var(--panel-border)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 md:px-4 py-2 md:py-3 border-b border-[var(--panel-border)] bg-[var(--panel-2)]">
        <div className="flex items-center gap-1 md:gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Previous"
            className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-[var(--panel)] text-[var(--text-muted)]"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={goToToday}
            className="text-xs px-2.5 py-1.5 rounded border border-[var(--panel-border)] hover:bg-[var(--panel)] text-[var(--text)]"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => navigate(1)}
            aria-label="Next"
            className="inline-flex h-9 w-9 items-center justify-center rounded hover:bg-[var(--panel)] text-[var(--text-muted)]"
          >
            <ChevronRight size={18} />
          </button>
          <button
            ref={headerLabelRef}
            type="button"
            aria-expanded={navigatorOpen}
            aria-haspopup="dialog"
            aria-label={`${headerLabel}, choose date`}
            onClick={() => setNavigatorOpen(open => !open)}
            className="ml-1 md:ml-2 truncate rounded px-1.5 py-0.5 text-sm font-semibold text-[var(--text)] hover:bg-[var(--panel)] transition-colors"
          >
            {headerLabel}
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {(['month', 'week', 'day'] as CalendarViewMode[]).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`text-xs px-2.5 py-1.5 rounded capitalize transition-colors ${
                viewMode === mode
                  ? 'bg-[var(--link)] text-white'
                  : 'text-[var(--text-muted)] hover:bg-[var(--panel)]'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {canDrag ? (
        <div className="px-3 md:px-4 py-1.5 text-[11px] text-[var(--text-subtle)] border-b border-[var(--panel-border)]">
          Drag entries to reschedule · click a date to add
        </div>
      ) : canAdd ? (
        <div className="px-3 md:px-4 py-1.5 text-[11px] text-[var(--text-subtle)] border-b border-[var(--panel-border)]">
          Click a date to add an entry
        </div>
      ) : null}

      <CalendarFilterStrip
        search={search}
        setSearch={setSearch}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
      />

      {filtersActive && filteredEntries.length > 0 ? (
        <div className="px-3 md:px-4 py-1.5 text-xs text-[var(--text-subtle)] border-b border-[var(--panel-border)]">
          Showing {filteredEntries.length} of {entries.length} entries
        </div>
      ) : null}

      <CalendarDateNavigator
        anchorRef={headerLabelRef}
        currentDate={currentDate}
        open={navigatorOpen}
        onClose={() => setNavigatorOpen(false)}
        onSelect={setCurrentDate}
      />

      {dndEnabled ? (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          {calendarBody}
          <DragOverlay dropAnimation={null}>
            {activeDragEntry ? (
              <CalendarDragOverlayCard entry={activeDragEntry} />
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : (
        calendarBody
      )}
    </div>
  );
}

export const CalendarWidget = CalendarWidgetInner;
