/**
 * useRetrieve Vitest.
 *
 * The hook now sources its mode from global Settings (Settings → Search
 * → Mode) instead of URL query params. The per-strip inline Mode
 * dropdown was retired so the choice is made once and applied
 * everywhere. ``semantic`` is the default. These tests mock the
 * settings store so each scenario can pin the active mode.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
});

vi.mock('../../api/retrieve', () => ({
  retrieve: vi.fn(),
}));

// Settings mock — each test sets the desired mode before mounting.
let currentMode: 'graph' | 'semantic' | 'hybrid' = 'semantic';
vi.mock('../../features/settings/store', () => ({
  useSettings: () => [
    { retrieval: { mode: currentMode } },
    vi.fn(),
  ],
}));

import * as retrieveApi from '../../api/retrieve';
import { useRetrieve } from '../useRetrieve';

function wrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  currentMode = 'semantic';
  (retrieveApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
    results: [],
    dropped_for_permission: 0,
    mode: 'semantic',
    requested_mode: 'semantic',
    degraded: false,
    candidates_examined: 0,
  });
});

describe('useRetrieve()', () => {
  it('reads mode from global settings — semantic by default', () => {
    currentMode = 'semantic';
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    expect(result.current.mode).toBe('semantic');
  });

  it('honors a Settings-driven graph mode', () => {
    currentMode = 'graph';
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    expect(result.current.mode).toBe('graph');
  });

  it('honors a Settings-driven hybrid mode', () => {
    currentMode = 'hybrid';
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    expect(result.current.mode).toBe('hybrid');
  });

  it('run() is a no-op in graph mode (no API call)', async () => {
    currentMode = 'graph';
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.run('hello');
    });
    expect(retrieveApi.retrieve).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it('run() calls /api/retrieve with mode + scope + trimmed query in semantic mode', async () => {
    currentMode = 'semantic';
    const { result } = renderHook(
      () => useRetrieve({ scope: 'track:t-1' }),
      { wrapper: wrapper() },
    );
    await act(async () => {
      await result.current.run('  hello world  ');
    });
    expect(retrieveApi.retrieve).toHaveBeenCalledWith({
      query: 'hello world',
      scope: 'track:t-1',
      mode: 'semantic',
    });
  });

  it('run() with empty query is a no-op and clears results/error', async () => {
    currentMode = 'hybrid';
    (retrieveApi.retrieve as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [
        {
          entry_id: 'e-1',
          track_id: 't-1',
          score: 1,
          mode_origin: ['graph'],
          provenance: null,
          snippet: 's',
        },
      ],
      dropped_for_permission: 0,
      mode: 'hybrid',
      requested_mode: 'hybrid',
      degraded: false,
      candidates_examined: 1,
    });
    const { result } = renderHook(() => useRetrieve({ scope: 't' }), {
      wrapper: wrapper(),
    });
    await act(async () => {
      await result.current.run('hello');
    });
    expect(result.current.results).toHaveLength(1);
    await act(async () => {
      await result.current.run('   ');
    });
    expect(result.current.results).toEqual([]);
  });

  it('surfaces an error envelope when /api/retrieve throws', async () => {
    currentMode = 'hybrid';
    (retrieveApi.retrieve as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('connector down'),
    );
    const { result } = renderHook(() => useRetrieve({ scope: 't' }), {
      wrapper: wrapper(),
    });
    await act(async () => {
      await result.current.run('hello');
    });
    expect(result.current.error).toMatch(/connector down/i);
    expect(result.current.results).toEqual([]);
  });
});
