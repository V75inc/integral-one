import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { isVisible, useLiveValuesProvider } from '../regionConditions';

describe('useLiveValuesProvider', () => {
  it('lets a later seed fill a value that was blank in the first snapshot', () => {
    const { result, rerender } = renderHook(({ seed }) => useLiveValuesProvider(seed), {
      initialProps: { seed: { invoice_number: '', status: 'draft' } as Record<string, unknown> },
    });
    rerender({ seed: { invoice_number: 'INV-0002', status: 'draft' } });
    expect(result.current.values.invoice_number).toBe('INV-0002');
  });

  it('keeps a committed value over a later seed', () => {
    const { result, rerender } = renderHook(({ seed }) => useLiveValuesProvider(seed), {
      initialProps: { seed: { memo: '' } as Record<string, unknown> },
    });
    act(() => result.current.commit('memo', 'typed by user'));
    rerender({ seed: { memo: 'from host' } });
    expect(result.current.values.memo).toBe('typed by user');
  });
});

describe('isVisible', () => {
  it('keeps the equals behaviour', () => {
    expect(isVisible({ field: 'status', equals: 'paid' }, { status: 'paid' })).toBe(true);
    expect(isVisible({ field: 'status', equals: 'paid' }, { status: 'draft' })).toBe(false);
    expect(isVisible(undefined, {})).toBe(true);
  });

  it('matches any of a list with in, and none of a list with not_in', () => {
    expect(isVisible({ field: 's', in: ['a', 'b'] }, { s: 'b' })).toBe(true);
    expect(isVisible({ field: 's', in: ['a', 'b'] }, { s: 'c' })).toBe(false);
    expect(isVisible({ field: 's', not_in: ['a', 'b'] }, { s: 'c' })).toBe(true);
    expect(isVisible({ field: 's', not_in: ['a', 'b'] }, { s: 'a' })).toBe(false);
  });
});
