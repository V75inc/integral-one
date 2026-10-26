import { useCallback, useEffect } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSerialPolling } from '../useSerialPolling';
import { useSingleFlight } from '../useSingleFlight';

describe('bounded polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('coalesces initial, timer and manual reads until a slow read settles', async () => {
    let finish!: () => void;
    const read = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { result, unmount } = renderHook(() => {
      const refresh = useSingleFlight(useCallback(read, []));
      useEffect(() => { void refresh(); }, [refresh]);
      useSerialPolling(refresh, 1000);
      return refresh;
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); void result.current(); });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(999); });
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(read).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { finish(); await vi.advanceTimersByTimeAsync(30_000); });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('pauses hidden tabs and makes one read on return', async () => {
    let visibility = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility as DocumentVisibilityState);
    const read = vi.fn().mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useSerialPolling(read, 1000));
    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(read).not.toHaveBeenCalled();
    visibility = 'visible';
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    expect(read).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('continues boundedly after failures', async () => {
    const read = vi.fn().mockRejectedValueOnce(new Error('Busy')).mockResolvedValue(undefined);
    const { unmount } = renderHook(() => useSerialPolling(read, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(read).toHaveBeenCalledTimes(2);
    unmount();
  });
});

it('coalesces refresh bursts into one trailing read for newer state', async () => {
  let finish!: (value: string) => void;
  const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue('latest');
  const { result, unmount } = renderHook(() => useSingleFlight(useCallback(read, []), true));
  let pending!: Promise<unknown>;
  act(() => {
    pending = result.current();
    for (let n = 0; n < 100; n += 1) void result.current();
  });
  expect(read).toHaveBeenCalledTimes(1);
  await act(async () => { finish('older'); await pending; });
  expect(read).toHaveBeenCalledTimes(2);
  await expect(pending).resolves.toBe('latest');
  unmount();
});
