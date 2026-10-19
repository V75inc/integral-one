import { describe, it, expect } from 'vitest';
import type { OperationalModelFieldSpec, Entry, EntryTypeNode, SavedView } from '../../../types';
import { getMissingRequiredFields } from '../../../utils/entryMetaFields';
import {
  buildCreateInputForDate,
  entryOverlapsDateRange,
  filterCalendarEntries,
  getEntryDate,
  isSchedulableCalendarField,
  matchesCalendarSearch,
  moveEntryToDate,
  normalizeCalendarMapping,
  parseCalendarDropId,
  resolveCalendarCreateEntryTypeKey,
} from '../calendarUtils';

function entry(
  id: string,
  overrides: Partial<Entry> & { custom_fields?: Record<string, unknown> } = {}
): Entry {
  return {
    id,
    title: overrides.title ?? `Entry ${id}`,
    body: overrides.body ?? '',
    type: overrides.type ?? 'task',
    track_id: 'track-1',
    created_at: overrides.created_at ?? '2026-05-01T10:00:00Z',
    updated_at: overrides.updated_at ?? '2026-05-01T10:00:00Z',
    custom_fields: overrides.custom_fields,
    ...overrides,
  } as Entry;
}

const mapping = { date_field: 'start', end_date_field: 'end' };

describe('calendarUtils', () => {
  describe('matchesCalendarSearch', () => {
    it('matches title and body case-insensitively', () => {
      const e = entry('1', { title: 'Team Standup', body: 'Discuss roadmap' });
      expect(matchesCalendarSearch(e, 'standup')).toBe(true);
      expect(matchesCalendarSearch(e, 'ROADMAP')).toBe(true);
      expect(matchesCalendarSearch(e, 'missing')).toBe(false);
    });

    it('passes when query is empty', () => {
      expect(matchesCalendarSearch(entry('1'), '')).toBe(true);
    });
  });

  describe('entryOverlapsDateRange', () => {
    it('matches single-day entries inside the range', () => {
      const e = entry('1', {
        custom_fields: { start: '2026-05-10', end: '2026-05-10' },
      });
      expect(
        entryOverlapsDateRange(
          e,
          mapping,
          new Date(2026, 4, 1),
          new Date(2026, 4, 31)
        )
      ).toBe(true);
    });

    it('matches multi-day spans that overlap the range edge', () => {
      const e = entry('1', {
        custom_fields: { start: '2026-05-28', end: '2026-06-03' },
      });
      expect(
        entryOverlapsDateRange(
          e,
          mapping,
          new Date(2026, 5, 1),
          new Date(2026, 5, 30)
        )
      ).toBe(true);
    });

    it('excludes entries entirely before the range', () => {
      const e = entry('1', {
        custom_fields: { start: '2026-04-01', end: '2026-04-15' },
      });
      expect(
        entryOverlapsDateRange(
          e,
          mapping,
          new Date(2026, 4, 1),
          new Date(2026, 4, 31)
        )
      ).toBe(false);
    });
  });

  describe('filterCalendarEntries', () => {
    const entries = [
      entry('1', {
        title: 'May event',
        custom_fields: { start: '2026-05-05' },
      }),
      entry('2', {
        title: 'June retreat',
        custom_fields: { start: '2026-06-12' },
      }),
    ];

    it('filters by search and date range together', () => {
      const result = filterCalendarEntries(entries, mapping, {
        search: 'retreat',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
      });
      expect(result.map(e => e.id)).toEqual(['2']);
    });

    it('returns all entries when no filters are set', () => {
      expect(filterCalendarEntries(entries, mapping, {})).toHaveLength(2);
    });
  });

  describe('getEntryDate', () => {
    it('parses yyyy-MM-dd as local calendar day (not UTC midnight)', () => {
      const e = entry('1', { custom_fields: { start: '2026-06-02' } });
      const d = getEntryDate(e, mapping);
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(5);
      expect(d!.getDate()).toBe(2);
      // Guard against `new Date('yyyy-MM-dd')` UTC shift: local key must match storage.
      expect(`${d!.getFullYear()}-${String(d!.getMonth() + 1).padStart(2, '0')}-${String(d!.getDate()).padStart(2, '0')}`).toBe(
        '2026-06-02'
      );
    });
  });

  describe('normalizeCalendarMapping', () => {
    it('normalizes camelCase profile keys and custom_fields prefix', () => {
      expect(
        normalizeCalendarMapping({
          dateField: 'custom_fields.publish_date',
          endDateField: 'custom_fields.end_date',
        })
      ).toEqual({
        date_field: 'publish_date',
        end_date_field: 'end_date',
      });
    });
  });

  describe('moveEntryToDate', () => {
    it('moves the start date and preserves multi-day span', () => {
      const e = entry('1', {
        custom_fields: { start: '2026-05-05', end: '2026-05-07' },
      });
      const moved = moveEntryToDate(e, mapping, new Date(2026, 5, 10));
      expect(moved.custom_fields?.start).toBe('2026-06-10');
      expect(moved.custom_fields?.end).toBe('2026-06-12');
    });
  });

  describe('buildCreateInputForDate', () => {
    it('pre-fills the mapped date field', () => {
      const input = buildCreateInputForDate(new Date(2026, 4, 20), mapping);
      expect(input.custom_fields?.start).toBe('2026-05-20');
    });

    it('flags HRM employee quick-add as missing required member', () => {
      const employeeFields = [
        { key: 'member', name: 'Member account', type: 'member', required: true },
        { key: 'start_date', name: 'Start date', type: 'date' },
      ] as OperationalModelFieldSpec[];
      const input = buildCreateInputForDate(
        new Date(2026, 5, 8),
        { date_field: 'start_date' }
      );
      expect(getMissingRequiredFields(employeeFields, input.custom_fields)).toEqual([
        employeeFields[0],
      ]);
    });
  });

  describe('parseCalendarDropId', () => {
    it('parses day and hour drop targets', () => {
      expect(parseCalendarDropId('day:2026-05-10:14')).toEqual({
        day: new Date(2026, 4, 10),
        hour: 14,
      });
    });
  });

  describe('resolveCalendarCreateEntryTypeKey', () => {
    const contentPiece: EntryTypeNode = {
      id: 'et-cp',
      name: 'ContentPiece',
      form_schema: {
        fields: [
          { key: 'publish_date', name: 'Publish date', type: 'date' },
          { key: 'status', name: 'Status', type: 'select', required: true },
        ],
      },
    };
    const post: EntryTypeNode = {
      id: 'et-post',
      name: 'Post',
      form_schema: { fields: [] },
    };
    const view = {
      id: 'v1',
      name: 'Calendar',
      type: 'calendar',
      entry_type_keys: ['content_piece'],
      default_entry_type_key: 'content_piece',
    } as SavedView;

    it('picks ContentPiece when publish_date is mapped', () => {
      expect(
        resolveCalendarCreateEntryTypeKey(view, [contentPiece, post], 'publish_date')
      ).toBe('contentpiece');
    });

    it('returns undefined when no entry type owns the date field', () => {
      expect(
        resolveCalendarCreateEntryTypeKey(view, [post], 'publish_date', 'content_piece')
      ).toBeUndefined();
    });
  });

  describe('isSchedulableCalendarField', () => {
    const contentPiece: EntryTypeNode = {
      id: 'et-cp',
      name: 'ContentPiece',
      form_schema: {
        fields: [{ key: 'publish_date', name: 'Publish date', type: 'date' }],
      },
    };
    const post: EntryTypeNode = {
      id: 'et-post',
      name: 'Post',
      form_schema: { fields: [] },
    };

    it('is false for readonly created_at mapping', () => {
      expect(
        isSchedulableCalendarField({ date_field: 'created_at' }, [contentPiece])
      ).toBe(false);
    });

    it('is false when only Post exists and publish_date is mapped', () => {
      expect(
        isSchedulableCalendarField({ date_field: 'publish_date' }, [post])
      ).toBe(false);
    });

    it('is true when an entry type declares the mapped field', () => {
      expect(
        isSchedulableCalendarField({ date_field: 'publish_date' }, [contentPiece])
      ).toBe(true);
    });
  });
});
