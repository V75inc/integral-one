import { describe, it, expect } from 'vitest';
import {
  formatDateFieldDisplay,
  formatDateFieldInputValue,
  isDateFieldEmpty,
  parseDateFieldValue,
  parseFlexibleDateInput,
  toDateFieldStorage,
} from '../dateFieldValue';

describe('dateFieldValue', () => {
  it('isDateFieldEmpty treats blank as empty', () => {
    expect(isDateFieldEmpty('')).toBe(true);
    expect(isDateFieldEmpty('  ')).toBe(true);
    expect(isDateFieldEmpty(null)).toBe(true);
    expect(isDateFieldEmpty('2026-06-02')).toBe(false);
  });

  it('parseDateFieldValue accepts yyyy-MM-dd', () => {
    const d = parseDateFieldValue('2026-06-02', 'date');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(2);
  });

  it('parseDateFieldValue accepts ISO datetime', () => {
    const d = parseDateFieldValue('2026-06-02T14:30:00', 'datetime');
    expect(d).not.toBeNull();
    expect(d!.getHours()).toBe(14);
    expect(d!.getMinutes()).toBe(30);
  });

  it('toDateFieldStorage emits yyyy-MM-dd for date mode', () => {
    const d = new Date(2026, 5, 2, 15, 0, 0);
    expect(toDateFieldStorage(d, 'date')).toBe('2026-06-02');
  });

  it('formatDateFieldDisplay returns empty for invalid', () => {
    expect(formatDateFieldDisplay('', 'date')).toBe('');
    expect(formatDateFieldDisplay('not-a-date', 'date')).toBe('');
  });

  it('parseFlexibleDateInput accepts common typed formats', () => {
    expect(parseFlexibleDateInput('1990-03-15', 'date')?.getFullYear()).toBe(1990);
    expect(parseFlexibleDateInput('3/15/1990', 'date')?.getMonth()).toBe(2);
    expect(parseFlexibleDateInput('Mar 15, 1990', 'date')?.getDate()).toBe(15);
  });

  it('formatDateFieldDisplay returns the new human-readable view format', () => {
    expect(formatDateFieldDisplay('2026-08-07', 'date')).toBe('7th August, 2026');
    expect(formatDateFieldDisplay('2026-08-07T12:00:00', 'datetime')).toBe('7th August, 2026, 12:00 PM');
  });

  it('formatDateFieldInputValue returns the new editable format', () => {
    expect(formatDateFieldInputValue('2026-08-07', 'date')).toBe('07/08/2026');
    expect(formatDateFieldInputValue('2026-08-07T12:00:00', 'datetime')).toBe('07/08/2026 12:00');
  });

  it('parseFlexibleDateInput accepts day-first dd/MM/yyyy format', () => {
    expect(parseFlexibleDateInput('15/03/1990', 'date')?.getFullYear()).toBe(1990);
    expect(parseFlexibleDateInput('15/03/1990', 'date')?.getMonth()).toBe(2);
    expect(parseFlexibleDateInput('15/03/1990', 'date')?.getDate()).toBe(15);
  });
});
