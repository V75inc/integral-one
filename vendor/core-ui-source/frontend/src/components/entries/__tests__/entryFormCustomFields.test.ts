import { describe, expect, it } from 'vitest';
import {
  buildCustomFieldsForEntryType,
  diffCustomFields,
  resolveFieldValuesForEntryType,
  valuesEqualForDiff,
} from '../entryFormCustomFields';
import type { OperationalModelFieldSpec } from '../../../types';

describe('buildCustomFieldsForEntryType', () => {
  const ideaFields: OperationalModelFieldSpec[] = [
    { key: 'category', name: 'Category', type: 'select' },
    { key: 'status', name: 'Status', type: 'select' },
  ];

  it('drops baseline keys not on the active entry type', () => {
    const out = buildCustomFieldsForEntryType(
      ideaFields,
      { category: 'product' },
      { source: 'web', category: 'research', status: 'draft' }
    );
    expect(out).toEqual({ category: 'product', status: 'draft' });
    expect(out).not.toHaveProperty('source');
  });

  it('preserves internal keys from baseline', () => {
    const out = buildCustomFieldsForEntryType(
      ideaFields,
      {},
      { _link_preview: { url: 'https://x.test' }, source: 'x' }
    );
    expect(out._link_preview).toEqual({ url: 'https://x.test' });
    expect(out).not.toHaveProperty('source');
  });

  it('preserves _type_field_cache from baseline', () => {
    const cache = { qb_invoice: { invoice_number: 'INV-9' } };
    const out = buildCustomFieldsForEntryType(ideaFields, { category: 'x' }, {
      _type_field_cache: cache,
      category: 'old',
    });
    expect(out._type_field_cache).toEqual(cache);
    expect(out.category).toBe('x');
  });
});

describe('buildCustomFieldsForEntryType (changedOnly)', () => {
  const fields: OperationalModelFieldSpec[] = [
    { key: 'pipeline_status', name: 'Pipeline status', type: 'select' },
    { key: 'owner', name: 'Owner', type: 'member' },
    { key: 'notes', name: 'Notes', type: 'text' },
    { key: 'related', name: 'Related', type: 'relation' },
  ];

  it('omits unchanged fields (incl. protected) and includes changed ones', () => {
    const out = buildCustomFieldsForEntryType(
      fields,
      { pipeline_status: 'contacted' },
      { pipeline_status: 'new', owner: 'n.User.1', notes: 'hi' },
      null,
      { changedOnly: true }
    );
    expect(out).toEqual({ pipeline_status: 'contacted' });
    expect(out).not.toHaveProperty('owner');
    expect(out).not.toHaveProperty('notes');
  });

  it('includes a cleared field', () => {
    const out = buildCustomFieldsForEntryType(
      fields,
      { owner: '' },
      { owner: 'n.User.1' },
      null,
      { changedOnly: true }
    );
    expect(out).toHaveProperty('owner', '');
  });

  it('ignores benign representation diffs (number/string, array order)', () => {
    const out = buildCustomFieldsForEntryType(
      [
        { key: 'amount', name: 'Amount', type: 'number' },
        { key: 'related', name: 'Related', type: 'relation' },
      ],
      { amount: 42, related: ['b', 'a'] },
      { amount: '42', related: ['a', 'b'] },
      null,
      { changedOnly: true }
    );
    expect(out).toEqual({});
  });

  it('includes all fields when changedOnly is not set (create mode)', () => {
    const out = buildCustomFieldsForEntryType(fields, { pipeline_status: 'new' }, {
      owner: 'n.User.1',
      notes: 'hi',
    });
    expect(out).toEqual({
      pipeline_status: 'new',
      owner: 'n.User.1',
      notes: 'hi',
    });
  });
});

describe('form write boundaries', () => {
  const fields: OperationalModelFieldSpec[] = [
    { key: 'server_reference', name: 'Server reference', type: 'text', readonly: true },
    { key: 'link_state', name: 'Link state', type: 'text', hide_on_create: true },
    { key: 'name', name: 'Name', type: 'text' },
  ];

  it('omits read-only and empty hidden values from create payloads', () => {
    expect(buildCustomFieldsForEntryType(fields, {
      server_reference: 'cannot-set', link_state: null, name: 'Example',
    })).toEqual({ name: 'Example' });
  });

  it('preserves explicit hidden prefill and editable null values', () => {
    expect(buildCustomFieldsForEntryType(fields, {
      link_state: 'prefilled', name: null,
    })).toEqual({ link_state: 'prefilled', name: null });
  });

  it('does not resend a read-only value on edit even if local state changed', () => {
    expect(buildCustomFieldsForEntryType(fields,
      { server_reference: 'changed', link_state: 'new' },
      { server_reference: 'stored', link_state: 'old' }, null, { changedOnly: true },
    )).toEqual({ link_state: 'new' });
  });
});

describe('diffCustomFields', () => {
  it('drops unchanged keys (incl. a protected-style owner), keeps changed ones', () => {
    const out = diffCustomFields(
      { pipeline_status: 'contacted', owner: 'n.User.1', _kanban_order: 2 },
      { pipeline_status: 'new', owner: 'n.User.1', _kanban_order: 1 }
    );
    expect(out).toEqual({ pipeline_status: 'contacted', _kanban_order: 2 });
    expect(out).not.toHaveProperty('owner');
  });

  it('keeps cleared values and new keys', () => {
    expect(diffCustomFields({ owner: '' }, { owner: 'n.User.1' })).toEqual({
      owner: '',
    });
    expect(diffCustomFields({ fresh: 'x' }, {})).toEqual({ fresh: 'x' });
  });

  it('preserves representation and array order changes without field metadata', () => {
    expect(
      diffCustomFields(
        { amount: 42, related: ['b', 'a'] },
        { amount: '42', related: ['a', 'b'] }
      )
    ).toEqual({ amount: 42, related: ['b', 'a'] });
  });
});

describe('valuesEqualForDiff', () => {
  it('normalizes empty representations only for known non-JSON fields', () => {
    const field: OperationalModelFieldSpec = { key: 'notes', name: 'Notes', type: 'text' };
    expect(valuesEqualForDiff(null, undefined, field)).toBe(true);
    expect(valuesEqualForDiff('', null, field)).toBe(true);
    expect(valuesEqualForDiff('', null)).toBe(false);
  });

  it('detects real changes', () => {
    expect(valuesEqualForDiff('a', 'b')).toBe(false);
    expect(valuesEqualForDiff(['a'], ['b'])).toBe(false);
  });

  it('preserves primitive types and array order by default', () => {
    expect(valuesEqualForDiff(42, '42')).toBe(false);
    expect(valuesEqualForDiff(true, 'true')).toBe(false);
    expect(valuesEqualForDiff(['a', 'b'], ['b', 'a'])).toBe(false);
  });

  it('ignores object key order without changing nested data', () => {
    expect(valuesEqualForDiff({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 })).toBe(true);
    expect(valuesEqualForDiff({ rows: [1, 2] }, { rows: [2, 1] })).toBe(false);
    expect(valuesEqualForDiff({ value: null }, { value: '' })).toBe(false);
    expect(valuesEqualForDiff({ value: 1 }, { value: '1' })).toBe(false);
  });
});

describe('JSON edits reach save payloads', () => {
  const field: OperationalModelFieldSpec = { key: 'data', name: 'Data', type: 'json' };
  const edits: [unknown, unknown][] = [
    [[1, 2], [2, 1]],
    [{ rows: [{ step: 'first' }, { step: 'second' }] }, { rows: [{ step: 'second' }, { step: 'first' }] }],
    [1, '1'],
    [true, 'true'],
    [null, ''],
    [{ rows: [null] }, { rows: [''] }],
  ];

  it.each(edits)('keeps JSON change from %j to %j in form and widget updates', (before, after) => {
    expect(buildCustomFieldsForEntryType([field], { data: after }, { data: before }, null, { changedOnly: true })).toEqual({ data: after });
    expect(diffCustomFields({ data: after }, { data: before })).toEqual({ data: after });
  });

  it('still omits unchanged JSON and protected fields', () => {
    expect(buildCustomFieldsForEntryType([field, { key: 'owner', name: 'Owner', type: 'member' }], { data: { b: 2, a: [1, 2] }, owner: 'user-1' }, { data: { a: [1, 2], b: 2 }, owner: 'user-1' }, null, { changedOnly: true })).toEqual({});
  });
});

describe('resolveFieldValuesForEntryType', () => {
  const invoiceFields: OperationalModelFieldSpec[] = [
    { key: 'invoice_number', name: 'Invoice #', type: 'text' },
    { key: 'amount', name: 'Amount', type: 'number' },
  ];

  it('hydrates from active custom_fields and per-type cache', () => {
    const values = resolveFieldValuesForEntryType('qb_invoice', invoiceFields, {
      amount: 10,
      _type_field_cache: { qb_invoice: { invoice_number: 'INV-1' } },
    });
    expect(values).toEqual({ amount: 10, invoice_number: 'INV-1' });
  });
});
