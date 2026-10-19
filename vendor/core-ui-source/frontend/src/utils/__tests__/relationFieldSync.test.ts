import { describe, expect, it } from 'vitest';
import { deriveRelationLabelPatch } from '../relationFieldSync';
import type { OperationalModelFieldSpec } from '../../types';

const customerField: OperationalModelFieldSpec = {
  key: 'customer',
  name: 'Customer',
  type: 'relation',
  validation: { write_label_to: 'customer_name' },
};

describe('deriveRelationLabelPatch', () => {
  it('copies the choice label without the track suffix', () => {
    const patch = deriveRelationLabelPatch(customerField, 'n.Entry.abc', [
      { value: 'n.Entry.abc', label: 'David Henry (Customers)' },
    ]);
    expect(patch).toEqual({ customer_name: 'David Henry' });
  });

  it('clears the target when the relation is cleared', () => {
    expect(deriveRelationLabelPatch(customerField, '', [])).toEqual({
      customer_name: '',
    });
  });

  it('no-ops without write_label_to', () => {
    expect(
      deriveRelationLabelPatch(
        { key: 'customer', name: 'Customer', type: 'relation' },
        'n.Entry.abc',
        [{ value: 'n.Entry.abc', label: 'X' }]
      )
    ).toBeNull();
  });
});
