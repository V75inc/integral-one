import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import './date-picker.css';
import { CalendarMonthGrid } from './CalendarMonthGrid';
import { AppSelect } from './AppSelect';
import { LINE_ICON_STROKE } from './IconWell';
import { IconButton, Text } from '../../ui';
import type { DateFieldMode } from '../../utils/dateFieldValue';
import {
  applyTimeToDate,
  formatDateFieldDisplay,
  formatDateFieldInputValue,
  getDateFieldTimeParts,
  isDateFieldEmpty,
  parseDateFieldValue,
  parseFlexibleDateInput,
  toDateFieldStorage,
} from '../../utils/dateFieldValue';

export type DatePickerProps = {
  mode: DateFieldMode;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  'aria-label'?: string;
  id?: string;
  /** seamless = borderless composer row; field = bordered app-input shell */
  variant?: 'seamless' | 'field';
  className?: string;
  'data-testid'?: string;
  onFocus?: () => void;
  onBlur?: () => void;
};

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: String(h).padStart(2, '0'),
}));

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, m) => ({
  value: String(m),
  label: String(m).padStart(2, '0'),
}));

function buildHourMinuteOptions() {
  return { hours: HOUR_OPTIONS, minutes: MINUTE_OPTIONS };
}

function defaultPlaceholder(mode: DateFieldMode): string {
  return mode === 'datetime'
    ? 'DD/MM/YYYY HH:MM or pick…'
    : 'DD/MM/YYYY or pick…';
}

export function DatePicker({
  mode,
  value,
  onChange,
  disabled = false,
  placeholder,
  'aria-label': ariaLabel,
  id,
  variant = 'field',
  className = '',
  'data-testid': dataTestId,
  onFocus,
  onBlur,
}: DatePickerProps) {
  const resolvedPlaceholder = placeholder ?? defaultPlaceholder(mode);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => {
    const parsed = parseDateFieldValue(value, mode);
    return parsed ?? new Date();
  });
  const [hour, setHour] = useState(() => getDateFieldTimeParts(value).hour);
  const [minute, setMinute] = useState(() => getDateFieldTimeParts(value).minute);
  const [pendingDay, setPendingDay] = useState<Date | null>(null);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [inputError, setInputError] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const calendarBtnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const isProgrammaticFocusRef = useRef(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    minWidth: number;
    maxWidth: number;
  } | null>(null);

  const panelId = useId();
  const empty = isDateFieldEmpty(value);
  const display = empty ? resolvedPlaceholder : formatDateFieldDisplay(value, mode);
  const selected = parseDateFieldValue(value, mode) ?? undefined;

  const { hours, minutes } = buildHourMinuteOptions();

  const [prevValue, setPrevValue] = useState(value);
  const [prevMode, setPrevMode] = useState(mode);

  useEffect(() => {
    const parsed = parseDateFieldValue(value, mode);
    if (parsed) {
      setMonth(parsed);
      const parts = getDateFieldTimeParts(value);
      setHour(parts.hour);
      setMinute(parts.minute);
    }
    if (value !== prevValue || mode !== prevMode) {
      setDraft(empty ? '' : formatDateFieldInputValue(value, mode));
      setPrevValue(value);
      setPrevMode(mode);
    }
    if (!isEditing) {
      setInputError(false);
    }
  }, [value, mode, isEditing, empty, prevValue, prevMode]);

  const anchorRef = inputRef;

  const updateCoords = useCallback(() => {
    const el = anchorRef.current ?? calendarBtnRef.current;
    if (!el || typeof window === 'undefined') return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    const maxWidth = Math.max(0, window.innerWidth - 2 * pad);
    setCoords({
      top: r.bottom + 4,
      left: Math.max(pad, Math.min(r.left, window.innerWidth - pad - 280)),
      minWidth: Math.max(r.width, 280),
      maxWidth,
    });
  }, []);

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

  const close = useCallback(() => {
    setOpen(false);
    setPendingDay(null);
    onBlur?.();
  }, [onBlur]);

  const openPopover = useCallback(() => {
    if (disabled) return;
    setOpen(true);
    setPendingDay(selected ?? null);
    if (selected) {
      const parts = getDateFieldTimeParts(value);
      setHour(parts.hour);
      setMinute(parts.minute);
    }
    onFocus?.();
  }, [disabled, onFocus, selected, value]);

  const commitDay = useCallback(
    (day: Date) => {
      if (mode === 'date') {
        const storageVal = toDateFieldStorage(day, 'date');
        isProgrammaticFocusRef.current = true;
        onChange(storageVal);
        setOpen(false);
        setPendingDay(null);
        setIsEditing(true);
        setDraft(formatDateFieldInputValue(storageVal, 'date'));
        setInputError(false);
        onBlur?.();
        inputRef.current?.focus();
        setTimeout(() => {
          isProgrammaticFocusRef.current = false;
        }, 0);
        return;
      }
      const withTime = applyTimeToDate(day, hour, minute);
      onChange(toDateFieldStorage(withTime, 'datetime'));
      setPendingDay(day);
    },
    [mode, onChange, hour, minute, onBlur]
  );

  const commitDateTime = useCallback(
    (day: Date, h: number, m: number) => {
      const withTime = applyTimeToDate(day, h, m);
      onChange(toDateFieldStorage(withTime, 'datetime'));
    },
    [onChange]
  );

  const commitDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onChange('');
      setInputError(false);
      setIsEditing(false);
      return true;
    }
    const parsed = parseFlexibleDateInput(trimmed, mode);
    if (!parsed) {
      setInputError(true);
      return false;
    }
    onChange(toDateFieldStorage(parsed, mode));
    setMonth(parsed);
    setInputError(false);
    setIsEditing(false);
    return true;
  }, [draft, mode, onChange]);

  const handleInputFocus = () => {
    if (disabled) return;
    if (isProgrammaticFocusRef.current) {
      onFocus?.();
      return;
    }
    setIsEditing(true);
    setDraft(empty ? '' : formatDateFieldInputValue(value, mode));
    setInputError(false);
    onFocus?.();
  };

  const handleInputBlur = () => {
    if (open) return;
    if (isEditing) {
      const ok = commitDraft();
      if (!ok) {
        setDraft(empty ? '' : formatDateFieldInputValue(value, mode));
      }
    }
    setIsEditing(false);
    onBlur?.();
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (commitDraft()) {
        inputRef.current?.blur();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setDraft(empty ? '' : formatDateFieldInputValue(value, mode));
      setInputError(false);
      setIsEditing(false);
      inputRef.current?.blur();
    }
    if (e.key === 'ArrowDown' && !open) {
      e.preventDefault();
      openPopover();
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        inputRef.current?.contains(t) ||
        calendarBtnRef.current?.contains(t) ||
        panelRef.current?.contains(t)
      ) {
        return;
      }
      close();
      inputRef.current?.focus();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open, close]);

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setDraft('');
    setInputError(false);
    close();
  };

  const activeDay = pendingDay ?? selected;

  const shellClass =
    variant === 'field'
      ? 'integral-date-picker-shell flex min-w-0 flex-1 items-center gap-1 rounded-[var(--radius-input)] border border-[var(--panel-border)] px-2 py-1 focus-within:ring-2 focus-within:ring-[var(--focus-ring-color)] disabled:cursor-not-allowed disabled:opacity-60'
      : 'flex min-w-0 flex-1 items-center gap-1 bg-transparent px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60';

  // Tone is driven by data-attributes resolved in date-picker.css — an
  // <input> has no child node for <Text> to wrap.
  const inputClass =
    'integral-date-picker-input min-w-0 flex-1 bg-transparent py-1 text-sm outline-none';

  const inputDisplayValue = isEditing
    ? draft
    : empty
      ? ''
      : formatDateFieldDisplay(value, mode);

  const popover =
    open &&
    coords &&
    createPortal(
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-label={ariaLabel ?? (mode === 'datetime' ? 'Choose date and time' : 'Choose date')}
        className="integral-date-picker-popover fixed z-popover rounded-[var(--radius-input)] border border-[var(--panel-border)] p-3 shadow-lg"
        style={{
          top: coords.top,
          left: coords.left,
          minWidth: coords.minWidth,
          maxWidth: coords.maxWidth,
        }}
      >
        <CalendarMonthGrid
          month={month}
          selected={activeDay}
          onMonthChange={setMonth}
          onSelectDay={commitDay}
          resetView={open}
        />
        {mode === 'datetime' && activeDay ? (
          <div className="mt-3 flex items-center gap-2 border-t border-[var(--panel-border)] pt-3">
            <Text variant="body-sm" weight="medium" tone="muted" className="shrink-0">
              Time
            </Text>
            <AppSelect
              className="min-w-0 flex-1"
              variant="pill"
              value={String(hour)}
              onValueChange={h => {
                const nextH = Number(h);
                setHour(nextH);
                commitDateTime(activeDay, nextH, minute);
              }}
              options={hours}
              aria-label="Hour"
            />
            <Text tone="muted">:</Text>
            <AppSelect
              className="min-w-0 flex-1"
              variant="pill"
              value={String(minute)}
              onValueChange={m => {
                const nextM = Number(m);
                setMinute(nextM);
                commitDateTime(activeDay, hour, nextM);
              }}
              options={minutes}
              aria-label="Minute"
            />
          </div>
        ) : null}
      </div>,
      document.body
    );

  return (
    <div className={`relative flex min-w-0 items-stretch gap-1 ${className}`}>
      <div className={shellClass} data-testid={dataTestId}>
        <input
          ref={inputRef}
          type="text"
          id={id}
          disabled={disabled}
          value={inputDisplayValue}
          placeholder={resolvedPlaceholder}
          aria-label={ariaLabel ?? (empty ? resolvedPlaceholder : display)}
          aria-invalid={inputError || undefined}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? panelId : undefined}
          autoComplete="off"
          inputMode="text"
          className={inputClass}
          data-empty={!isEditing && empty ? 'true' : undefined}
          data-invalid={inputError ? 'true' : undefined}
          onChange={e => {
            setDraft(e.target.value);
            if (!isEditing) setIsEditing(true);
            setInputError(false);
          }}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
        />
        <IconButton
          ref={calendarBtnRef}
          disabled={disabled}
          label={open ? 'Close calendar' : 'Open calendar'}
          aria-expanded={open}
          onMouseDown={e => e.preventDefault()}
          onClick={() => (open ? close() : openPopover())}
        >
          <CalendarIcon size={16} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        </IconButton>
      </div>
      {!empty && !disabled ? (
        <IconButton
          label="Clear date"
          className="self-center"
          onClick={handleClear}
        >
          <X size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />
        </IconButton>
      ) : null}
      {inputError ? (
        <p className="absolute left-0 top-full mt-0.5 text-xs text-[var(--danger-fg)]">
          {mode === 'datetime' ? 'Use DD/MM/YYYY HH:MM' : 'Use DD/MM/YYYY'}
        </p>
      ) : null}
      {popover}
    </div>
  );
}
