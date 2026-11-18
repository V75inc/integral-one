import { describe, expect, it } from 'vitest';
import { isVisible } from '../../views/regionConditions';

describe('readonly_if uses the shared condition shape', () => {
  const cond = { field: 'status', not_in: ['draft'] };

  it('locks once the record is past draft', () => {
    expect(isVisible(cond, { status: 'approved' })).toBe(true);
    expect(isVisible(cond, { status: 'paid' })).toBe(true);
  });

  it('stays editable while the record is a draft', () => {
    expect(isVisible(cond, { status: 'draft' })).toBe(false);
  });

  it('supports equals and in', () => {
    expect(isVisible({ field: 'status', equals: 'paid' }, { status: 'paid' })).toBe(true);
    expect(isVisible({ field: 'status', in: ['a', 'b'] }, { status: 'c' })).toBe(false);
  });
});
