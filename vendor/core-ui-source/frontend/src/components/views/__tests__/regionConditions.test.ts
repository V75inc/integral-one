import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useLiveValuesProvider } from '../regionConditions';

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
