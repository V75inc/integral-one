import { describe, expect, it } from 'vitest';
import { aggregate, bucketByMonth, getFieldValue, groupBy } from '../chartAggregate';
import type { Entry } from '../../../types';

function entry(id: string, custom_fields: Record<string, unknown>): Entry {
  return { id, title: id, custom_fields } as unknown as Entry;
}

describe('getFieldValue', () => {
  it('reads title, custom_fields.x, and bare-key fallback', () => {
    const e = entry('e1', { department: 'Eng' });
    expect(getFieldValue(e, 'title')).toBe('e1');
    expect(getFieldValue(e, 'custom_fields.department')).toBe('Eng');
    expect(getFieldValue(e, 'department')).toBe('Eng');
  });

  it('does not fall back from a null business value to a platform value', () => {
    const e = { ...entry('e1', { status: null }), status: 'active' };
    expect(getFieldValue(e, 'custom_fields.status')).toBeNull();
    expect(getFieldValue(e, 'status')).toBe('active');
  });
});

describe('groupBy', () => {
  it('groups entries by field value, missing values bucket as (none)', () => {
    const entries = [
      entry('a', { department: 'Eng' }),
      entry('b', { department: 'Eng' }),
      entry('c', { department: 'Sales' }),
      entry('d', {}),
    ];
    const groups = groupBy(entries, 'custom_fields.department');
    expect(groups.get('Eng')?.length).toBe(2);
    expect(groups.get('Sales')?.length).toBe(1);
    expect(groups.get('(none)')?.length).toBe(1);
  });

  it('handles empty input', () => {
    expect(groupBy([], 'custom_fields.department').size).toBe(0);
  });
});

describe('aggregate', () => {
  it('count mode counts group size regardless of valueField', () => {
    const groups = groupBy(
      [entry('a', { d: 'Eng' }), entry('b', { d: 'Eng' }), entry('c', { d: 'Sales' })],
      'custom_fields.d'
    );
    const points = aggregate(groups, { mode: 'count' });
    expect(points.find(p => p.key === 'Eng')?.value).toBe(2);
    expect(points.find(p => p.key === 'Sales')?.value).toBe(1);
  });

  it('sum mode adds numeric valueField, skipping non-numeric/missing', () => {
    const groups = groupBy(
      [
        entry('a', { d: 'Eng', salary: 1000 }),
        entry('b', { d: 'Eng', salary: 2000 }),
        entry('c', { d: 'Eng', salary: null }),
      ],
      'custom_fields.d'
    );
    const points = aggregate(groups, { mode: 'sum', valueField: 'custom_fields.salary' });
    expect(points[0].value).toBe(3000);
  });

  it('avg mode averages only entries with a finite numeric value (does not treat missing as 0)', () => {
    const groups = groupBy(
      [
        entry('a', { d: 'Eng', salary: 1000 }),
        entry('b', { d: 'Eng', salary: 3000 }),
        entry('c', { d: 'Eng', salary: undefined }),
      ],
      'custom_fields.d'
    );
    const points = aggregate(groups, { mode: 'avg', valueField: 'custom_fields.salary' });
    // (1000 + 3000) / 2 = 2000, not / 3
    expect(points[0].value).toBe(2000);
  });

  it('handles a tie between two groups (both retain their own values, no collapsing)', () => {
    const groups = groupBy(
      [entry('a', { d: 'Eng', v: 5 }), entry('b', { d: 'Sales', v: 5 })],
      'custom_fields.d'
    );
    const points = aggregate(groups, { mode: 'sum', valueField: 'custom_fields.v' });
    expect(points.find(p => p.key === 'Eng')?.value).toBe(5);
    expect(points.find(p => p.key === 'Sales')?.value).toBe(5);
  });

  it('sum/avg on a group with zero numeric values returns 0, not NaN', () => {
    const groups = groupBy([entry('a', { d: 'Eng', v: 'not-a-number' })], 'custom_fields.d');
    expect(aggregate(groups, { mode: 'sum', valueField: 'custom_fields.v' })[0].value).toBe(0);
    expect(aggregate(groups, { mode: 'avg', valueField: 'custom_fields.v' })[0].value).toBe(0);
  });
});

describe('bucketByMonth', () => {
  it('buckets entries into YYYY-MM keys', () => {
    const entries = [
      entry('a', { date: '2025-01-15' }),
      entry('b', { date: '2025-01-28' }),
      entry('c', { date: '2025-02-01' }),
    ];
    const buckets = bucketByMonth(entries, 'custom_fields.date');
    expect(buckets.get('2025-01')?.length).toBe(2);
    expect(buckets.get('2025-02')?.length).toBe(1);
  });

  it('excludes entries with missing or unparseable dates rather than crashing', () => {
    const entries = [
      entry('a', { date: '2025-01-15' }),
      entry('b', { date: null }),
      entry('c', {}),
      entry('d', { date: 'not-a-date' }),
    ];
    const buckets = bucketByMonth(entries, 'custom_fields.date');
    const total = Array.from(buckets.values()).reduce((n, g) => n + g.length, 0);
    expect(total).toBe(1);
  });

  it('handles entries spanning a year boundary', () => {
    const entries = [
      entry('a', { date: '2024-12-31' }),
      entry('b', { date: '2025-01-01' }),
    ];
    const buckets = bucketByMonth(entries, 'custom_fields.date');
    expect(buckets.has('2024-12')).toBe(true);
    expect(buckets.has('2025-01')).toBe(true);
  });

  it('handles empty input', () => {
    expect(bucketByMonth([], 'custom_fields.date').size).toBe(0);
  });
});
