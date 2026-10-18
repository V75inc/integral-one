import {
  format,
  formatISO,
  isValid,
  parse,
  parseISO,
} from 'date-fns';

export type DateFieldMode = 'date' | 'datetime';

/** True when the stored value is absent or whitespace-only. */
export function isDateFieldEmpty(raw: string | null | undefined): boolean {
  return raw == null || String(raw).trim() === '';
}

/**
 * Parse a operational-model date/datetime string into a local Date.
 * Accepts ISO 8601 and plain ``yyyy-MM-dd``.
 */
export function parseDateFieldValue(
  raw: string | null | undefined,
  _mode: DateFieldMode
): Date | null {
  const s = raw == null ? '' : String(raw).trim();
  if (!s) return null;

  // Plain calendar date (date fields and date-only prefixes of datetimes).
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = parse(s, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : null;
  }

  // datetime-local shape without seconds (legacy native input).
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) {
    const d = parse(s, "yyyy-MM-dd'T'HH:mm", new Date());
    return isValid(d) ? d : null;
  }

  const d = parseISO(s);
  return isValid(d) ? d : null;
}

/** Human-readable label for the trigger button. */
export function formatDateFieldDisplay(
  raw: string | null | undefined,
  mode: DateFieldMode
): string {
  const d = parseDateFieldValue(raw, mode);
  if (!d) return '';
  return mode === 'datetime'
    ? format(d, "do MMMM, yyyy, h:mm a")
    : format(d, 'do MMMM, yyyy');
}

/** Serialize a Date for API storage. */
export function toDateFieldStorage(date: Date, mode: DateFieldMode): string {
  if (mode === 'date') {
    return format(date, 'yyyy-MM-dd');
  }
  // Local ISO without timezone offset — matches ``datetime-local`` payloads.
  return formatISO(date, { representation: 'complete' });
}

/** Extract hour (0–23) and minute from a parsed value, defaulting to noon. */
export function getDateFieldTimeParts(raw: string | null | undefined): {
  hour: number;
  minute: number;
} {
  const d = parseDateFieldValue(raw, 'datetime');
  if (!d) return { hour: 12, minute: 0 };
  return { hour: d.getHours(), minute: d.getMinutes() };
}

/** Apply hour/minute to a calendar day (local). */
export function applyTimeToDate(
  day: Date,
  hour: number,
  minute: number
): Date {
  const next = new Date(day);
  next.setHours(hour, minute, 0, 0);
  return next;
}

const FLEXIBLE_DATE_FORMATS = [
  'dd/MM/yyyy',
  'd/M/yyyy',
  'yyyy-MM-dd',
  'dd-MM-yyyy',
  'd-M-yyyy',
  'M/d/yyyy',
  'MM/dd/yyyy',
  'M-d-yyyy',
  'MM-dd-yyyy',
  'MMM d, yyyy',
  'MMMM d, yyyy',
  'MMM d yyyy',
  'MMMM d yyyy',
] as const;

const FLEXIBLE_DATETIME_FORMATS = [
  'dd/MM/yyyy HH:mm',
  'dd/MM/yyyy h:mm a',
  'd/M/yyyy HH:mm',
  'd/M/yyyy h:mm a',
  "yyyy-MM-dd'T'HH:mm",
  'yyyy-MM-dd HH:mm',
  'M/d/yyyy h:mm a',
  'M/d/yyyy HH:mm',
  'MM/dd/yyyy h:mm a',
  'MM/dd/yyyy HH:mm',
] as const;

/**
 * Parse typed date/datetime input for manual entry.
 * Accepts ISO dates, US slash/dash forms, and short/long month names.
 */
export function parseFlexibleDateInput(
  raw: string,
  mode: DateFieldMode
): Date | null {
  const s = raw.trim();
  if (!s) return null;

  const fromStorage = parseDateFieldValue(s, mode);
  if (fromStorage) return fromStorage;

  const formats =
    mode === 'datetime'
      ? [...FLEXIBLE_DATETIME_FORMATS, ...FLEXIBLE_DATE_FORMATS]
      : [...FLEXIBLE_DATE_FORMATS];

  for (const fmt of formats) {
    const d = parse(s, fmt, new Date());
    if (isValid(d)) return d;
  }

  return null;
}

/** Compact editable format shown while typing in the date field. */
export function formatDateFieldInputValue(
  raw: string | null | undefined,
  mode: DateFieldMode
): string {
  const d = parseDateFieldValue(raw, mode);
  if (!d) return '';
  return mode === 'datetime'
    ? format(d, 'dd/MM/yyyy HH:mm')
    : format(d, 'dd/MM/yyyy');
}
