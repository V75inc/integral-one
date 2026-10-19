import { describe, it, expect } from 'vitest';
import { humanizeEnumValue, humanizeFieldKey } from '../humanizeFieldKey';

describe('humanizeFieldKey', () => {
  it('strips trailing _track suffix and Title-Cases', () => {
    expect(humanizeFieldKey('details_track')).toBe('Details');
  });

  it('Title-Cases snake_case keys', () => {
    expect(humanizeFieldKey('close_date')).toBe('Close date');
    expect(humanizeFieldKey('lifetime_value')).toBe('Lifetime value');
  });

  it('hides internal underscore-prefixed keys', () => {
    expect(humanizeFieldKey('_cp_index')).toBe('');
    expect(humanizeFieldKey('_internal')).toBe('');
  });

  it('returns empty string for empty / nullish input', () => {
    expect(humanizeFieldKey('')).toBe('');
    expect(humanizeFieldKey(null)).toBe('');
    expect(humanizeFieldKey(undefined)).toBe('');
  });

  it('handles single-word keys', () => {
    expect(humanizeFieldKey('stage')).toBe('Stage');
    expect(humanizeFieldKey('ACME')).toBe('Acme');
  });

  it('handles hyphenated and space-separated keys', () => {
    expect(humanizeFieldKey('close-date')).toBe('Close date');
    expect(humanizeFieldKey('close date')).toBe('Close date');
  });
});

describe('humanizeEnumValue', () => {
  it('Title-Cases ordinary snake_case values', () => {
    expect(humanizeEnumValue('prospecting')).toBe('Prospecting');
    expect(humanizeEnumValue('closed_won')).toBe('Closed won');
    expect(humanizeEnumValue('qualifies_q3')).toBe('Qualifies q3');
  });

  it('preserves already-uppercase single-token values instead of mangling them', () => {
    // Regression: payroll-app's Compensation Record "currency" select field
    // stores ISO codes (GYD/USD/EUR/GBP) as the enum values themselves —
    // the same string is both the stored value AND the display label. The
    // shared titleCaseSnake() unconditionally lowercased everything after
    // the first letter, so the Guyana employee detail page's Compensation
    // Record card, and the currency <select>'s own option labels
    // (SeamlessField reuses this function), rendered "Gyd" instead of
    // "GYD" for the exact same value the create form's enum declares.
    expect(humanizeEnumValue('GYD')).toBe('GYD');
    expect(humanizeEnumValue('USD')).toBe('USD');
    expect(humanizeEnumValue('EUR')).toBe('EUR');
    expect(humanizeEnumValue('GBP')).toBe('GBP');
  });

  it('still humanizes an all-caps MULTI-word value normally (not a bare acronym)', () => {
    expect(humanizeEnumValue('IN_PROGRESS')).toBe('In progress');
  });

  it('preserves explicitly cased human-readable labels', () => {
    expect(humanizeEnumValue('Needs Repair')).toBe('Needs Repair');
    expect(humanizeEnumValue('Needs repair')).toBe('Needs repair');
  });

  it('returns empty string for empty / nullish input', () => {
    expect(humanizeEnumValue('')).toBe('');
    expect(humanizeEnumValue(null)).toBe('');
    expect(humanizeEnumValue(undefined)).toBe('');
  });
});
