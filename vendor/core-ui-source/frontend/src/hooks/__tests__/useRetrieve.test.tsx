/**
 * useRetrieve Vitest.
 *
 * The hook now sources its mode from global Settings (Settings → Search
 * → Mode) instead of URL query params. The per-strip inline Mode
 * dropdown was retired so the choice is made once and applied
 * everywhere. ``hybrid`` is the default. These tests mock the
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
let currentMode: 'lexical' | 'semantic' | 'hybrid' = 'semantic';
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
  it('preserves restricted App coverage and clears it on workspace change and reset', async () => {
    vi.mocked(retrieveApi.retrieve).mockResolvedValue({
      results: [], dropped_for_permission: 0, mode: 'semantic', requested_mode: 'semantic',
      degraded: false, candidates_examined: 1, boundary: { declared_query_required: true },
    });
    const { result, rerender } = renderHook(
      ({ workspace }) => useRetrieve({ authorityKey: workspace }),
      { initialProps: { workspace: 'first' }, wrapper: wrapper() },
    );
    await act(async () => { await result.current.run('receipt'); });
    expect(result.current.appQueryRequired).toBe(true);
    rerender({ workspace: 'second' });
    expect(result.current.appQueryRequired).toBe(false);
    await act(async () => { await result.current.run('receipt'); });
    expect(result.current.appQueryRequired).toBe(true);
    act(() => result.current.reset());
    expect(result.current.appQueryRequired).toBe(false);
  });

  it('does not let an old restricted response contaminate a newer open search', async () => {
    let finishOld!: (value: retrieveApi.RetrieveResponse) => void;
    vi.mocked(retrieveApi.retrieve)
      .mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; }))
      .mockResolvedValueOnce({ results: [], dropped_for_permission: 0, mode: 'semantic',
        requested_mode: 'semantic', degraded: false, candidates_examined: 0 });
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    let old!: Promise<void>;
    act(() => { old = result.current.run('old search'); });
    await act(async () => { await result.current.run('new search'); });
    await act(async () => {
      finishOld({ results: [], dropped_for_permission: 0, mode: 'semantic',
        requested_mode: 'semantic', degraded: false, candidates_examined: 1,
        boundary: { declared_query_required: true } });
      await old;
    });
    expect(result.current.submittedQuery).toBe('new search');
    expect(result.current.appQueryRequired).toBe(false);
  });

  it('clears previous read restrictions when a later search fails', async () => {
    vi.mocked(retrieveApi.retrieve)
      .mockResolvedValueOnce({ results: [], dropped_for_permission: 0, mode: 'semantic',
        requested_mode: 'semantic', degraded: false, candidates_examined: 1,
        boundary: { declared_query_required: true } })
      .mockRejectedValueOnce(new Error('Unavailable'));
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    await act(async () => { await result.current.run('receipt'); });
    expect(result.current.appQueryRequired).toBe(true);
    await act(async () => { await result.current.run('other'); });
    expect(result.current.appQueryRequired).toBe(false);
    expect(result.current.error).toBe('Unavailable');
  });

  it('reads a semantic mode from global settings', () => {
    currentMode = 'semantic';
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    expect(result.current.mode).toBe('semantic');
  });

  it('honors a Settings-driven lexical mode', () => {
    currentMode = 'lexical';
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    expect(result.current.mode).toBe('lexical');
  });

  it('honors a Settings-driven hybrid mode', () => {
    currentMode = 'hybrid';
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    expect(result.current.mode).toBe('hybrid');
  });

  it('sends lexical search to the retrieval service', async () => {
    currentMode = 'lexical';
    const { result } = renderHook(() => useRetrieve(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.run('hello');
    });
    expect(retrieveApi.retrieve).toHaveBeenCalledWith({ query: 'hello', scope: undefined, mode: 'lexical' });
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

it('ignores a late response after clearing the search or changing workspace', async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(retrieveApi.retrieve).mockImplementationOnce(() => new Promise(done => { resolve = done; }) as any);
  const { result, rerender } = renderHook(({ authorityKey }) => useRetrieve({ authorityKey }), { initialProps: { authorityKey: 'w1' }, wrapper: wrapper() });
  let pending!: Promise<void>;
  act(() => { pending = result.current.run('old workspace'); });
  rerender({ authorityKey: 'w2' });
  await act(async () => {
    resolve({ results: [{ entry_id: 'old-result' }], degraded: false });
    await pending;
  });
  expect(result.current.results).toEqual([]);
  expect(result.current.loading).toBe(false);
});
