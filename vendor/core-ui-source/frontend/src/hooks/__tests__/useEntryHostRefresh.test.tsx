import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { entriesApi } from '../../api';
import type { Entry } from '../../types';
import { useEntryHostRefresh } from '../useEntryHostRefresh';

vi.mock('../../api', () => ({ entriesApi: { get: vi.fn() } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function deferred() {
  let resolve!: (entry: Entry) => void;
  const promise = new Promise<Entry>(done => { resolve = done; });
  return { promise, resolve };
}

describe('scoped host record refresh', () => {
  it.each(['entry', 'workspace', 'unmount'])('discards a delayed response after %s changes', async change => {
    const request = deferred();
    vi.mocked(entriesApi.get).mockReturnValueOnce(request.promise);
    const apply = vi.fn();
    const { result, rerender, unmount } = renderHook(({ id, ws }) => useEntryHostRefresh(id, ws, apply), {
      initialProps: { id: 'entry-a', ws: 'ws-a' },
    });
    let pending!: Promise<void>;
    act(() => { pending = result.current(); });
    if (change === 'unmount') unmount();
    else rerender({ id: change === 'entry' ? 'entry-b' : 'entry-a', ws: change === 'workspace' ? 'ws-b' : 'ws-a' });
    await act(async () => { request.resolve({ id: 'entry-a' } as Entry); await pending; });
    expect(apply).not.toHaveBeenCalled();
  });

  it('coalesces callers across rerenders, reads once more for a caller that arrived mid-read, then permits another read', async () => {
    const request = deferred();
    vi.mocked(entriesApi.get).mockReturnValueOnce(request.promise).mockResolvedValue({ id: 'entry-a' } as Entry);
    const apply = vi.fn();
    const { result, rerender } = renderHook(() => useEntryHostRefresh('entry-a', 'ws-a', entry => apply(entry)));
    let first!: Promise<void>;
    act(() => { first = result.current(); });
    rerender();
    expect(result.current()).toBe(first);
    expect(entriesApi.get).toHaveBeenCalledTimes(1);
    await act(async () => { request.resolve({ id: 'entry-a' } as Entry); await first; });
    // The caller that arrived while the first read was in flight gets a fresh read after it.
    expect(entriesApi.get).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(2);
    await act(async () => { await result.current(); });
    expect(entriesApi.get).toHaveBeenCalledTimes(3);
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it('a refresh requested after a change is not satisfied by a read that started before it', async () => {
    const stale = deferred();
    vi.mocked(entriesApi.get)
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ id: 'entry-a', custom_fields: { status: 'waiting_for_approval' } } as unknown as Entry);
    const seen: unknown[] = [];
    const { result } = renderHook(() => useEntryHostRefresh('entry-a', 'ws-a', entry => seen.push((entry as { custom_fields?: { status?: string } }).custom_fields?.status)));
    let poll!: Promise<void>;
    act(() => { poll = result.current(); });                 // a background poll, in flight
    let afterClick!: Promise<void>;
    act(() => { afterClick = result.current(); });           // the click's refresh arrives while it is in flight
    await act(async () => { stale.resolve({ id: 'entry-a', custom_fields: { status: 'waiting_for_review' } } as unknown as Entry); await Promise.all([poll, afterClick]); });
    expect(seen[seen.length - 1]).toBe('waiting_for_approval');
  });

  it('recovers after a failed read without changing the displayed record', async () => {
    vi.mocked(entriesApi.get).mockRejectedValueOnce(new Error('Temporary')).mockResolvedValueOnce({ id: 'entry-a' } as Entry);
    const apply = vi.fn();
    const { result } = renderHook(() => useEntryHostRefresh('entry-a', 'ws-a', apply));
    await act(async () => { await result.current(); });
    expect(apply).not.toHaveBeenCalled();
    await act(async () => { await result.current(); });
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
