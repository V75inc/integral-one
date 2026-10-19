import { describe, expect, it } from 'vitest';
import { displayValue, fieldValue } from '../ReportCenterWidget';

describe('fieldValue', () => {
  it('reads id/title straight off the entry — no custom_fields analog exists for either', () => {
    const entry = { id: 'e1', title: 'September 2026', custom_fields: {} };
    expect(fieldValue(entry, 'id')).toBe('e1');
    expect(fieldValue(entry, 'title')).toBe('September 2026');
  });

  it('uses a qualified path for a business field whose key collides with a platform field', () => {
    const entry = { status: 'active', custom_fields: { status: 'draft' } };
    expect(fieldValue(entry, 'custom_fields.status')).toBe('draft');
    expect(fieldValue(entry, 'status')).toBe('active');
  });

  it('falls back to the node-level field when no custom field of that name is declared', () => {
    const entry = { status: 'active', custom_fields: {} };
    expect(fieldValue(entry, 'status')).toBe('active');
  });

  it('does not infer a business field from an arbitrary top-level property', () => {
    const entry = { gross_total: 1000, custom_fields: {} };
    expect(fieldValue(entry, 'gross_total')).toBeUndefined();
  });
});

describe('displayValue', () => {
  it('humanizes a select value the same way every other select control in the app does', () => {
    // Report table columns carry no field-type info of their own (just a
    // bare `field` key + optional date/currency/number `format`) — the
    // caller must resolve the select-ness itself and pass it through, same
    // gap as TableWidget's own fix.
    expect(displayValue('approved', undefined, 'select')).toBe('Approved');
  });

  it('humanizes and joins every value of a multi_select', () => {
    expect(displayValue(['warehouse_ops', 'night_shift'], undefined, 'multi_select')).toBe(
      'Warehouse ops, Night shift'
    );
  });

  it('leaves a non-select value alone', () => {
    expect(displayValue('warehouse supervisor')).toBe('warehouse supervisor');
  });

  it('format takes precedence over selectType (should never both be set, but format wins if so)', () => {
    expect(displayValue(1234.5, 'currency', 'select')).toBe('1,234.50');
  });
});
