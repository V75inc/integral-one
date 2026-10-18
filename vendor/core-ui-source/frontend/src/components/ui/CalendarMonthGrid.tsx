import { useEffect, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LINE_ICON_STROKE } from './IconWell';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

type CalendarViewLevel = 'day' | 'month' | 'year';

function chunkWeeks(days: Date[]): Date[][] {
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }
  return weeks;
}

function yearGridStart(centerYear: number): number {
  return centerYear - 6;
}

const navBtnClass =
  'rounded p-1 text-[var(--text-muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]';

export type CalendarMonthGridProps = {
  month: Date;
  selected?: Date;
  onMonthChange: (next: Date) => void;
  onSelectDay: (day: Date) => void;
  /** When true, resets drill-down to the day grid (e.g. popover opened). */
  resetView?: boolean;
};

export function CalendarMonthGrid({
  month,
  selected,
  onMonthChange,
  onSelectDay,
  resetView = false,
}: CalendarMonthGridProps) {
  const [viewLevel, setViewLevel] = useState<CalendarViewLevel>('day');
  const [pickerYear, setPickerYear] = useState(() => month.getFullYear());
  const [yearGridAnchor, setYearGridAnchor] = useState(() =>
    yearGridStart(month.getFullYear())
  );

  useEffect(() => {
    setPickerYear(month.getFullYear());
    setYearGridAnchor(yearGridStart(month.getFullYear()));
  }, [month]);

  useEffect(() => {
    if (resetView) {
      setViewLevel('day');
    }
  }, [resetView]);

  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  });
  const weeks = chunkWeeks(days);
  const monthLabel = format(month, 'MMMM yyyy');
  const years = Array.from({ length: 12 }, (_, i) => yearGridAnchor + i);

  const selectMonth = (monthIndex: number) => {
    onMonthChange(new Date(pickerYear, monthIndex, 1));
    setViewLevel('day');
  };

  const selectYear = (year: number) => {
    setPickerYear(year);
    setViewLevel('month');
  };

  if (viewLevel === 'month') {
    return (
      <div className="integral-calendar">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className={navBtnClass}
            aria-label="Previous year"
            onClick={() => setPickerYear(y => y - 1)}
          >
            <ChevronLeft size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm font-semibold text-[var(--text)] hover:bg-[var(--panel-2)]"
            aria-label={`${pickerYear}, choose year`}
            onClick={() => {
              setYearGridAnchor(yearGridStart(pickerYear));
              setViewLevel('year');
            }}
          >
            {pickerYear}
          </button>
          <button
            type="button"
            className={navBtnClass}
            aria-label="Next year"
            onClick={() => setPickerYear(y => y + 1)}
          >
            <ChevronRight size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          </button>
        </div>
        <div
          role="grid"
          aria-label={`Months in ${pickerYear}`}
          className="grid grid-cols-3 gap-1"
        >
          {MONTH_LABELS.map((label, monthIndex) => {
            const isSelected =
              pickerYear === month.getFullYear() && monthIndex === month.getMonth();
            const isCurrentMonth =
              pickerYear === new Date().getFullYear() &&
              monthIndex === new Date().getMonth();
            return (
              <button
                key={label}
                type="button"
                role="gridcell"
                aria-label={format(new Date(pickerYear, monthIndex, 1), 'MMMM yyyy')}
                aria-pressed={isSelected}
                onClick={() => selectMonth(monthIndex)}
                className={[
                  'rounded px-2 py-2 text-sm transition-colors',
                  isSelected
                    ? 'bg-[var(--brand-accent)] text-white hover:bg-[var(--brand-accent)]'
                    : 'text-[var(--text)] hover:bg-[var(--panel-2)]',
                  isCurrentMonth && !isSelected
                    ? 'font-semibold text-[var(--brand-accent)]'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (viewLevel === 'year') {
    return (
      <div className="integral-calendar">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className={navBtnClass}
            aria-label="Previous years"
            onClick={() => setYearGridAnchor(y => y - 12)}
          >
            <ChevronLeft size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          </button>
          <span className="text-sm font-semibold text-[var(--text)]">
            {yearGridAnchor} – {yearGridAnchor + 11}
          </span>
          <button
            type="button"
            className={navBtnClass}
            aria-label="Next years"
            onClick={() => setYearGridAnchor(y => y + 12)}
          >
            <ChevronRight size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          </button>
        </div>
        <div
          role="grid"
          aria-label={`Years ${yearGridAnchor} to ${yearGridAnchor + 11}`}
          className="grid grid-cols-3 gap-1"
        >
          {years.map(year => {
            const isSelected = year === month.getFullYear();
            const isThisYear = year === new Date().getFullYear();
            return (
              <button
                key={year}
                type="button"
                role="gridcell"
                aria-label={String(year)}
                aria-pressed={isSelected}
                onClick={() => selectYear(year)}
                className={[
                  'rounded px-2 py-2 text-sm transition-colors',
                  isSelected
                    ? 'bg-[var(--brand-accent)] text-white hover:bg-[var(--brand-accent)]'
                    : 'text-[var(--text)] hover:bg-[var(--panel-2)]',
                  isThisYear && !isSelected
                    ? 'font-semibold text-[var(--brand-accent)]'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {year}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="integral-calendar">
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className={navBtnClass}
          aria-label="Previous month"
          onClick={() => onMonthChange(subMonths(month, 1))}
        >
          <ChevronLeft size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-sm font-semibold text-[var(--text)] hover:bg-[var(--panel-2)]"
          aria-label={`${monthLabel}, choose month and year`}
          onClick={() => {
            setPickerYear(month.getFullYear());
            setViewLevel('month');
          }}
        >
          {monthLabel}
        </button>
        <button
          type="button"
          className={navBtnClass}
          aria-label="Next month"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        </button>
      </div>
      <div role="grid" aria-label={monthLabel}>
        <div role="row" className="mb-1 grid grid-cols-7 gap-0.5">
          {WEEKDAY_LABELS.map(label => (
            <div
              key={label}
              role="columnheader"
              className="py-1 text-center text-xs font-medium text-[var(--text-muted)]"
            >
              {label}
            </div>
          ))}
        </div>
        {weeks.map((week, weekIndex) => (
          <div key={weekIndex} role="row" className="grid grid-cols-7 gap-0.5">
            {week.map(day => {
              const inMonth = isSameMonth(day, month);
              const isSelected = selected ? isSameDay(day, selected) : false;
              const dayNum = format(day, 'd');
              return (
                <div
                  key={day.toISOString()}
                  role="gridcell"
                  aria-selected={isSelected}
                  className="flex items-center justify-center"
                >
                  <button
                    type="button"
                    disabled={!inMonth}
                    aria-label={format(day, 'PPPP')}
                    aria-pressed={isSelected}
                    onClick={() => onSelectDay(day)}
                    className={[
                      'flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors',
                      !inMonth
                        ? 'cursor-default text-[var(--text-subtle)] opacity-50'
                        : 'text-[var(--text)] hover:bg-[var(--panel-2)]',
                      isSelected && inMonth
                        ? 'bg-[var(--brand-accent)] text-white hover:bg-[var(--brand-accent)]'
                        : '',
                      isToday(day) && !isSelected && inMonth
                        ? 'font-semibold text-[var(--brand-accent)]'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {dayNum}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
