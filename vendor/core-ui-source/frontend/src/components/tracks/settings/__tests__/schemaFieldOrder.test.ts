import { describe, expect, it } from 'vitest';
import { orderedSchemaFields, withOrderedFields } from '../schemaFieldOrder';

describe('base field ordering', () => {
  it('orders Title and Details with custom fields and saves them in base_fields', () => {
    const schema = { fields: [{ key: 'priority', name: 'Priority', type: 'text' }] };
    const rows = orderedSchemaFields(schema);
    expect(rows.map(row => row.key)).toEqual(['__base.title', 'priority', '__base.body']);
    const next = withOrderedFields(schema, [rows[2], rows[0], rows[1]].map((row, order) => ({ ...row, order })));
    expect(next.fields?.map(row => row.key)).toEqual(['priority']);
    expect(next.base_fields?.body?.order).toBe(0);
    expect(next.base_fields?.title?.order).toBe(1);
    expect(orderedSchemaFields(next).map(row => row.key)).toEqual(['__base.body', '__base.title', 'priority']);
  });
  it('keeps disabled base fields hidden and preserves base metadata', () => {
    const schema = { fields: [], base_fields: { title: { enabled: false }, body: { label: 'Notes', order: 4 } } };
    const rows = orderedSchemaFields(schema);
    expect(rows.map(row => row.name)).toEqual(['Notes']);
    const next = withOrderedFields(schema, rows);
    expect(next.base_fields?.title?.enabled).toBe(false);
    expect(next.base_fields?.body?.label).toBe('Notes');
  });
});
