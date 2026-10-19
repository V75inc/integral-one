import { describe, expect, it } from 'vitest';
import { deriveAutoOffsetPatch } from '../fieldDateOffset';
import type { OperationalModelFieldSpec } from '../../types';

/**
 * Core only understands the schema shape (term_days + auto_offset).
 * Domain vocabulary (invoice terms, net-30, …) lives in App OM YAML —
 * this fixture uses neutral keys on purpose.
 */
const fields: OperationalModelFieldSpec[] = [
  {
    key: 'plan_terms',
    name: 'Plan terms',
    type: 'select',
    validation: {
      term_days: {
        immediate: 0,
        plus_30: 30,
      },
    },
  },
  {
    key: 'start_date',
    name: 'Start date',
    type: 'date',
  },
  {
    key: 'end_date',
    name: 'End date',
    type: 'date',
    validation: {
      auto_offset: { from_date: 'start_date', from_terms: 'plan_terms' },
    },
  },
];

describe('deriveAutoOffsetPatch', () => {
  it('adds declared days when the terms field changes', () => {
    const patch = deriveAutoOffsetPatch(
      fields,
      { start_date: '2026-09-30', plan_terms: 'plus_30', end_date: '2026-09-30' },
      'plan_terms'
    );
    expect(patch).toEqual({ end_date: '2026-10-30' });
  });

  it('keeps the same day when terms map to zero', () => {
    const patch = deriveAutoOffsetPatch(
      fields,
      { start_date: '2026-09-30', plan_terms: 'immediate' },
      'start_date'
    );
    expect(patch).toEqual({ end_date: '2026-09-30' });
  });

  it('does not overwrite while the user edits the target date itself', () => {
    const patch = deriveAutoOffsetPatch(
      fields,
      { start_date: '2026-09-30', plan_terms: 'plus_30', end_date: '2026-10-01' },
      'end_date'
    );
    expect(patch).toBeNull();
  });
});
