import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSettings } from './store';

const key = 'integral.settings.v1';

beforeEach(() => localStorage.clear());

describe('search mode defaults and migration', () => {
  it('uses adaptive hybrid retrieval for a new browser', () => {
    const { result } = renderHook(() => useSettings());
    expect(result.current[0].retrieval.mode).toBe('hybrid');
  });

  it('migrates the previously persisted semantic default once', () => {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 3, retrieval: { mode: 'semantic' } }));
    const { result, unmount } = renderHook(() => useSettings());
    expect(result.current[0].retrieval.mode).toBe('hybrid');
    act(() => result.current[1](previous => ({ ...previous, retrieval: { mode: 'semantic' } })));
    unmount();
    const reopened = renderHook(() => useSettings());
    expect(reopened.result.current[0].retrieval.mode).toBe('semantic');
  });

  it('replaces the retired graph preference with hybrid', () => {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 3, retrieval: { mode: 'graph' } }));
    const { result } = renderHook(() => useSettings());
    expect(result.current[0].retrieval.mode).toBe('hybrid');
  });

  it.each(['lexical', 'hybrid'] as const)('preserves an existing %s preference', mode => {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 5, retrieval: { mode } }));
    const { result } = renderHook(() => useSettings());
    expect(result.current[0].retrieval.mode).toBe(mode);
  });

  it('defaults safely when a stored mode is invalid', () => {
    localStorage.setItem(key, JSON.stringify({ schemaVersion: 4, retrieval: { mode: 'unknown' } }));
    const { result } = renderHook(() => useSettings());
    expect(result.current[0].retrieval.mode).toBe('hybrid');
  });
});
