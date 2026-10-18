import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { endOfMonth, format } from 'date-fns';
import { LINE_ICON_STROKE } from '../ui/IconWell';
import { IconButton, Text } from '../../ui';
import './calendar-date-navigator.css';

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

type PickerLevel = 'month' | 'year';

export type CalendarDateNavigatorProps = {
  anchorRef: React.RefObject<HTMLElement | null>;
  currentDate: Date;
  open: boolean;
  onClose: () => void;
  onSelect: (date: Date) => void;
};

function keepDayOfMonth(source: Date, year: number, monthIndex: number): Date {
  const day = source.getDate();
  const lastDay = endOfMonth(new Date(year, monthIndex, 1)).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay));
}

function yearGridStart(centerYear: number): number {
  return centerYear - 6;
}

export function CalendarDateNavigator({
  anchorRef,
  currentDate,
  open,
  onClose,
  onSelect,
}: CalendarDateNavigatorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [level, setLevel] = useState<PickerLevel>('month');
  const [pickerYear, setPickerYear] = useState(() => currentDate.getFullYear());
  const [yearGridAnchor, setYearGridAnchor] = useState(() =>
    yearGridStart(currentDate.getFullYear())
  );
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    minWidth: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    const year = currentDate.getFullYear();
    setLevel('month');
    setPickerYear(year);
    setYearGridAnchor(yearGridStart(year));
  }, [open, currentDate]);

  const updateCoords = useCallback(() => {
    const el = anchorRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const width = 280;
    setCoords({
      top: r.bottom + 4,
      left: Math.max(pad, Math.min(r.left, window.innerWidth - pad - width)),
      minWidth: width,
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        anchorRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
      anchorRef.current?.focus();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, onClose, anchorRef]);

  const selectMonth = (monthIndex: number) => {
    onSelect(keepDayOfMonth(currentDate, pickerYear, monthIndex));
    onClose();
    anchorRef.current?.focus();
  };

  const selectYear = (year: number) => {
    setPickerYear(year);
    setLevel('month');
  };

  if (!open || !coords) return null;

  const currentMonthIndex = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();
  const years = Array.from({ length: 12 }, (_, i) => yearGridAnchor + i);

  return createPortal(
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-modal="false"
      aria-label="Choose month and year"
      className="calendar-navigator-popover fixed z-popover rounded-[var(--radius-input)] border border-[var(--panel-border)] p-3 shadow-lg"
      style={{
        top: coords.top,
        left: coords.left,
        minWidth: coords.minWidth,
      }}
    >
      {level === 'month' ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <IconButton
              label="Previous year"
              onClick={() => setPickerYear(y => y - 1)}
            >
              <ChevronLeft size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </IconButton>
            <button
              type="button"
              className="calendar-navigator-year-button rounded px-2 py-1 text-sm font-semibold"
              aria-label={`${pickerYear}, choose year`}
              onClick={() => {
                setYearGridAnchor(yearGridStart(pickerYear));
                setLevel('year');
              }}
            >
              {pickerYear}
            </button>
            <IconButton
              label="Next year"
              onClick={() => setPickerYear(y => y + 1)}
            >
              <ChevronRight size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </IconButton>
          </div>
          <div
            role="grid"
            aria-label={`Months in ${pickerYear}`}
            className="grid grid-cols-3 gap-1"
          >
            {MONTH_LABELS.map((label, monthIndex) => {
              const isSelected =
                pickerYear === currentYear && monthIndex === currentMonthIndex;
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
                  data-current={isCurrentMonth ? 'true' : undefined}
                  onClick={() => selectMonth(monthIndex)}
                  className="calendar-navigator-cell rounded px-2 py-2 text-sm transition-colors"
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <IconButton
              label="Previous years"
              onClick={() => setYearGridAnchor(y => y - 12)}
            >
              <ChevronLeft size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </IconButton>
            <Text variant="body" weight="semibold">
              {yearGridAnchor} – {yearGridAnchor + 11}
            </Text>
            <IconButton
              label="Next years"
              onClick={() => setYearGridAnchor(y => y + 12)}
            >
              <ChevronRight size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
            </IconButton>
          </div>
          <div
            role="grid"
            aria-label={`Years ${yearGridAnchor} to ${yearGridAnchor + 11}`}
            className="grid grid-cols-3 gap-1"
          >
            {years.map(year => {
              const isSelected = year === currentYear;
              const isThisYear = year === new Date().getFullYear();
              return (
                <button
                  key={year}
                  type="button"
                  role="gridcell"
                  aria-label={String(year)}
                  aria-pressed={isSelected}
                  data-current={isThisYear ? 'true' : undefined}
                  onClick={() => selectYear(year)}
                  className="calendar-navigator-cell rounded px-2 py-2 text-sm transition-colors"
                >
                  {year}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>,
    document.body
  );
}
