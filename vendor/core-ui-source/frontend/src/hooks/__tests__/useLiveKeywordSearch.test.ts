import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveKeywordSearch } from '../useLiveKeywordSearch';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('search submission', () => {
  it('debounces keyword searches until the user stops typing', () => {
    const search = vi.fn();
    const { rerender } = renderHook(({ query }) => useLiveKeywordSearch(query, true, search), {
      initialProps: { query: '' },
    });
    rerender({ query: 'pea' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ query: 'peanut' });
    act(() => vi.advanceTimersByTime(349));
    expect(search).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(search).toHaveBeenCalledOnce();
    expect(search).toHaveBeenCalledWith('peanut');
  });

  it('does not automatically submit semantic or hybrid queries', () => {
    const search = vi.fn();
    const { result, rerender } = renderHook(({ query }) => useLiveKeywordSearch(query, false, search), {
      initialProps: { query: '' },
    });
    rerender({ query: 'nut spread' });
    act(() => vi.advanceTimersByTime(1000));
    expect(search).not.toHaveBeenCalled();
    act(() => result.current('nut spread'));
    expect(search).toHaveBeenCalledExactlyOnceWith('nut spread');
  });

  it('cancels a pending live request when the user submits manually', () => {
    const search = vi.fn();
    const { result } = renderHook(() => useLiveKeywordSearch('peanut', true, search));
    act(() => result.current('peanut'));
    act(() => vi.advanceTimersByTime(1000));
    expect(search).toHaveBeenCalledExactlyOnceWith('peanut');
  });
});
