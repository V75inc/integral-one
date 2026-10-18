import {
  addDays,
  differenceInCalendarDays,
  endOfDay,
  parse,
  startOfDay,
} from 'date-fns';
import type { OperationalModelFieldSpec, EntryTypeNode, SavedView } from '../../types';
import type { Entry } from '../../types';
import type { EntryCreateInput } from '../../views/types';
import { entryTypeMatchesSlug, slugifyKanbanColumnKey } from './kanbanColumnUtils';
import {
  applyTimeToDate,
  parseDateFieldValue,
  toDateFieldStorage,
  type DateFieldMode,
} from '../../utils/dateFieldValue';
import { readEntryField } from './composable/utils';

export interface CalendarMapping {
  date_field?: string;
  end_date_field?: string;
  all_day_field?: string;
}

const READONLY_DATE_FIELDS = new Set(['created_at', 'updated_at']);

/** Parse stored field values as local calendar dates — never ``new Date('yyyy-MM-dd')``
 *  which ECMAScript treats as UTC midnight and shifts a day in US timezones. */
function toDate(val: unknown): Date | null {
  if (val == null || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  if (!s) return null;
  const mode: DateFieldMode = /^\d{4}-\d{2}-\d{2}$/.test(s) ? 'date' : 'datetime';
  return parseDateFieldValue(s, mode);
}

function parseLocalDayKey(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = parse(trimmed, 'yyyy-MM-dd', new Date());
  return isNaN(d.getTime()) ? null : d;
}

function normalizeFieldKey(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith('custom_fields.')) {
    return trimmed.slice('custom_fields.'.length);
  }
  return trimmed;
}

/** Normalize manifest / view config shapes (`dateField`, snake_case, etc.). */
export function normalizeCalendarMapping(
  raw: Record<string, unknown> | CalendarMapping | undefined
): CalendarMapping {
  const cm = (raw || {}) as Record<string, unknown>;
  return {
    date_field: normalizeFieldKey(cm.date_field ?? cm.dateField) || 'created_at',
    end_date_field: normalizeFieldKey(cm.end_date_field ?? cm.endDateField),
  };
}

export function isEditableCalendarField(mapping: CalendarMapping): boolean {
  const field = mapping.date_field || 'created_at';
  return !READONLY_DATE_FIELDS.has(field);
}

function entryTypeHasField(et: EntryTypeNode, fieldKey: string): boolean {
  const fields = (et.form_schema?.fields ?? []) as OperationalModelFieldSpec[];
  return fields.some(f => f.key === fieldKey);
}

function entryTypesWithField(
  entryTypes: EntryTypeNode[],
  fieldKey: string
): EntryTypeNode[] {
  return entryTypes.filter(et => entryTypeHasField(et, fieldKey));
}

function getViewEntryTypeConstraints(view: SavedView): {
  defaultKey: string;
  typeKeys: string[];
} {
  const def = String(view.default_entry_type_key || '').trim();
  const fromNode = (view.entry_type_keys || [])
    .map(k => slugifyKanbanColumnKey(String(k)))
    .filter(Boolean);
  const cfg = (view.config || {}) as Record<string, unknown>;
  const fromCfg = (Array.isArray(cfg.entry_type_keys) ? cfg.entry_type_keys : [])
    .map(k => slugifyKanbanColumnKey(String(k)))
    .filter(Boolean);
  return {
    defaultKey: def ? slugifyKanbanColumnKey(def) : '',
    typeKeys: fromNode.length ? fromNode : fromCfg,
  };
}

/** Entry-type slug to use when quick-adding from a calendar cell. */
export function resolveCalendarCreateEntryTypeKey(
  view: SavedView,
  entryTypes: EntryTypeNode[],
  dateFieldKey: string,
  trackDefaultKey?: string
): string | undefined {
  const candidates = entryTypesWithField(entryTypes, dateFieldKey);
  if (!candidates.length) return undefined;

  const { defaultKey, typeKeys } = getViewEntryTypeConstraints(view);
  const trackDefault = trackDefaultKey
    ? slugifyKanbanColumnKey(trackDefaultKey)
    : '';

  const preferSlugs = [defaultKey, ...typeKeys, trackDefault].filter(Boolean);

  for (const slug of preferSlugs) {
    const hit = candidates.find(et => entryTypeMatchesSlug(et.name || '', slug));
    if (hit) return slugifyKanbanColumnKey(hit.name || '');
  }

  return slugifyKanbanColumnKey(candidates[0].name || '');
}

/** True when the mapped date field can be written on create for at least one entry type. */
export function isSchedulableCalendarField(
  mapping: CalendarMapping,
  entryTypes: EntryTypeNode[],
  fieldsUnion?: OperationalModelFieldSpec[]
): boolean {
  if (!isEditableCalendarField(mapping)) return false;
  const field = mapping.date_field || 'created_at';
  if (entryTypes.length > 0) {
    return entryTypesWithField(entryTypes, field).length > 0;
  }
  if (fieldsUnion?.length) {
    return fieldsUnion.some(f => f.key === field);
  }
  return false;
}

export function inferDateFieldMode(
  entry: Entry | null,
  fieldKey: string,
  fields?: OperationalModelFieldSpec[]
): DateFieldMode {
  const spec = fields?.find(f => f.key === fieldKey);
  if (spec?.type === 'datetime') return 'datetime';
  if (spec?.type === 'date') return 'date';
  if (entry) {
    const raw = readEntryField(entry, fieldKey);
    if (typeof raw === 'string' && /T\d/.test(raw)) return 'datetime';
  }
  return 'date';
}

export function getEntryDate(entry: Entry, mapping: CalendarMapping): Date | null {
  const field = mapping.date_field || 'created_at';
  return toDate(readEntryField(entry, field));
}

export function getEntryEndDate(entry: Entry, mapping: CalendarMapping): Date | null {
  if (!mapping.end_date_field) return null;
  return toDate(readEntryField(entry, mapping.end_date_field));
}

function setEntryFieldValue(entry: Entry, fieldKey: string, value: string): Entry {
  if (READONLY_DATE_FIELDS.has(fieldKey)) {
    return { ...entry, [fieldKey]: value };
  }
  return {
    ...entry,
    custom_fields: {
      ...(entry.custom_fields || {}),
      [fieldKey]: value,
    },
  };
}

/** Move an entry onto ``targetDay``, preserving time-of-day and span length. */
export function moveEntryToDate(
  entry: Entry,
  mapping: CalendarMapping,
  targetDay: Date,
  options?: { hour?: number; fields?: OperationalModelFieldSpec[] }
): Entry {
  const dateField = mapping.date_field || 'created_at';
  const endField = mapping.end_date_field;
  const currentStart = getEntryDate(entry, mapping);
  if (!currentStart) return entry;

  const currentEnd = getEntryEndDate(entry, mapping);
  const mode = inferDateFieldMode(entry, dateField, options?.fields);

  let newStart: Date;
  if (options?.hour != null && mode === 'datetime') {
    newStart = applyTimeToDate(targetDay, options.hour, currentStart.getMinutes());
  } else if (mode === 'datetime') {
    newStart = applyTimeToDate(
      targetDay,
      currentStart.getHours(),
      currentStart.getMinutes()
    );
  } else {
    newStart = startOfDay(targetDay);
  }

  let next = setEntryFieldValue(
    entry,
    dateField,
    toDateFieldStorage(newStart, mode)
  );

  if (currentEnd && endField) {
    const endMode = inferDateFieldMode(entry, endField, options?.fields);
    const spanDays = differenceInCalendarDays(currentEnd, currentStart);
    const newEnd =
      spanDays === 0
        ? newStart
        : addDays(startOfDay(newStart), spanDays);
    next = setEntryFieldValue(
      next,
      endField,
      toDateFieldStorage(
        endMode === 'datetime'
          ? applyTimeToDate(newEnd, currentEnd.getHours(), currentEnd.getMinutes())
          : startOfDay(newEnd),
        endMode
      )
    );
  }

  return next;
}

export function buildCreateInputForDate(
  day: Date,
  mapping: CalendarMapping,
  fields?: OperationalModelFieldSpec[]
): EntryCreateInput {
  const field = mapping.date_field || 'created_at';
  const mode = inferDateFieldMode(null, field, fields);
  const value = toDateFieldStorage(startOfDay(day), mode);

  if (READONLY_DATE_FIELDS.has(field)) {
    return { title: 'New event' };
  }

  return {
    title: 'New event',
    custom_fields: { [field]: value },
  };
}

export function parseFilterDate(value: string): Date | null {
  return parseLocalDayKey(value);
}

export function calendarDropId(day: Date, hour?: number): string {
  const key = formatDayKey(day);
  return hour == null ? `day:${key}` : `day:${key}:${hour}`;
}

export function formatDayKey(day: Date): string {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseCalendarDropId(
  id: string
): { day: Date; hour?: number } | null {
  if (!id.startsWith('day:')) return null;
  const parts = id.split(':');
  if (parts.length < 2) return null;
  const day = parseLocalDayKey(parts[1]);
  if (!day) return null;
  const hour =
    parts.length >= 3 && parts[2] !== '' ? Number(parts[2]) : undefined;
  if (hour != null && (!Number.isInteger(hour) || hour < 0 || hour > 23)) {
    return { day };
  }
  return { day, hour };
}

/** True when the entry's calendar span overlaps an inclusive day range. */
export function entryOverlapsDateRange(
  entry: Entry,
  mapping: CalendarMapping,
  rangeFrom: Date | null,
  rangeTo: Date | null
): boolean {
  if (!rangeFrom && !rangeTo) return true;

  const start = getEntryDate(entry, mapping);
  if (!start) return false;

  const end = getEntryEndDate(entry, mapping) ?? start;
  const entryStart = startOfDay(start);
  const entryEnd = endOfDay(end);

  if (rangeFrom && entryEnd < startOfDay(rangeFrom)) return false;
  if (rangeTo && entryStart > endOfDay(rangeTo)) return false;
  return true;
}

export function matchesCalendarSearch(entry: Entry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const title = (entry.title || '').toLowerCase();
  const body = (entry.body || '').toLowerCase();
  const type = (entry.type || '').toLowerCase();
  return title.includes(q) || body.includes(q) || type.includes(q);
}

export function filterCalendarEntries(
  entries: Entry[],
  mapping: CalendarMapping,
  options: {
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): Entry[] {
  const rangeFrom = options.dateFrom ? parseFilterDate(options.dateFrom) : null;
  const rangeTo = options.dateTo ? parseFilterDate(options.dateTo) : null;
  const search = options.search ?? '';

  return entries.filter(entry => {
    if (!matchesCalendarSearch(entry, search)) return false;
    return entryOverlapsDateRange(entry, mapping, rangeFrom, rangeTo);
  });
}