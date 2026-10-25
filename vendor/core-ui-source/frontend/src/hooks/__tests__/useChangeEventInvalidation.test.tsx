import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ token: 'test-token', user: { id: 'user-1' } })),
}));

vi.mock('../../api/events', () => ({
  fetchEventsPage: vi.fn(),
  openEventStream: vi.fn(),
}));

vi.mock('../../services/graphMutationInvalidation', () => ({
  invalidateAfterAgentWrite: vi.fn(),
  invalidateAfterChangeEvents: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';
import { fetchEventsPage, openEventStream } from '../../api/events';
import { invalidateAfterChangeEvents } from '../../services/graphMutationInvalidation';
import { useChangeEventInvalidation } from '../useChangeEventInvalidation';

class FakeWebSocket {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  close = vi.fn();

  drop() {
    this.onclose?.();
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('useChangeEventInvalidation', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReturnValue({ token: 'test-token', user: { id: 'user-1' } } as ReturnType<typeof useAuth>);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('reconnects the event stream after a close', async () => {
    const first = new FakeWebSocket();
    const second = new FakeWebSocket();
    vi.mocked(openEventStream)
      .mockResolvedValueOnce(first as unknown as WebSocket)
      .mockResolvedValueOnce(second as unknown as WebSocket);

    renderHook(() => useChangeEventInvalidation(), { wrapper });
    await settle();
    expect(openEventStream).toHaveBeenCalledWith('user:user-1');

    act(() => first.drop());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(openEventStream).toHaveBeenCalledTimes(2);
  });

  it('retries after the stream cannot be opened', async () => {
    const recovered = new FakeWebSocket();
    vi.mocked(openEventStream)
      .mockRejectedValueOnce(new Error('ticket unavailable'))
      .mockResolvedValueOnce(recovered as unknown as WebSocket);

    renderHook(() => useChangeEventInvalidation(), { wrapper });
    await settle();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(openEventStream).toHaveBeenCalledTimes(2);
  });

  it('cancels a scheduled reconnect when unmounted', async () => {
    const first = new FakeWebSocket();
    vi.mocked(openEventStream).mockResolvedValue(first as unknown as WebSocket);

    const { unmount } = renderHook(() => useChangeEventInvalidation(), { wrapper });
    await settle();
    act(() => first.drop());
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(openEventStream).toHaveBeenCalledTimes(1);
  });
  it('stops a catch-up cycle when the cursor does not advance', async () => {
    const socket = new FakeWebSocket();
    vi.mocked(openEventStream).mockResolvedValue(socket as unknown as WebSocket);
    vi.mocked(fetchEventsPage).mockResolvedValue({ events: [], next_cursor: 'stuck', has_more: true });
    const { unmount } = renderHook(() => useChangeEventInvalidation(), { wrapper });
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchEventsPage).toHaveBeenCalledTimes(2);
    unmount();
  });

  it('bounds a busy event stream to ten pages per tick', async () => {
    const socket = new FakeWebSocket();
    vi.mocked(openEventStream).mockResolvedValue(socket as unknown as WebSocket);
    let cursor = 0;
    vi.mocked(fetchEventsPage).mockImplementation(async () => ({ events: [], next_cursor: String(++cursor), has_more: true }));
    const { unmount } = renderHook(() => useChangeEventInvalidation(), { wrapper });
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchEventsPage).toHaveBeenCalledTimes(10);
    unmount();
  });

  it('retains the live resume position after an exhausted history page', async () => {
    vi.mocked(openEventStream).mockResolvedValue(new FakeWebSocket() as unknown as WebSocket);
    vi.mocked(fetchEventsPage).mockResolvedValue({ events: [], next_cursor: null, resume_cursor: 'last-scanned', has_more: false });
    const { unmount } = renderHook(() => useChangeEventInvalidation(), { wrapper });
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchEventsPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ since: 'last-scanned' }));
    unmount();
  });

  it('coalesces a live write burst before invalidating queries', async () => {
    const socket = new FakeWebSocket();
    vi.mocked(openEventStream).mockResolvedValue(socket as unknown as WebSocket);
    const { unmount } = renderHook(() => useChangeEventInvalidation(), { wrapper });
    await settle();
    act(() => {
      for (let n = 0; n < 100; n += 1) socket.onmessage?.({ data: JSON.stringify({ id: String(n), ts: '2026-01-01T00:00:00Z', actor_kind: 'agent', actor_id: 'agent', action: 'entry.update', resource_id: 'entry', scope: 'track:track' }) } as MessageEvent);
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(invalidateAfterChangeEvents).toHaveBeenCalledTimes(1);
    expect(vi.mocked(invalidateAfterChangeEvents).mock.calls[0][1]).toHaveLength(1);
    unmount();
  });

  it('keeps the scan position when only the access token is renewed', async () => {
    vi.mocked(openEventStream).mockResolvedValue(new FakeWebSocket() as unknown as WebSocket);
    vi.mocked(fetchEventsPage).mockResolvedValue({ events: [], next_cursor: null, resume_cursor: 'resume-after-history', has_more: false });
    const { rerender, unmount } = renderHook(() => useChangeEventInvalidation(), { wrapper });
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    vi.mocked(useAuth).mockReturnValue({ token: 'renewed-token', user: { id: 'user-1' } } as ReturnType<typeof useAuth>);
    rerender();
    await settle();
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchEventsPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ since: 'resume-after-history' }));
    unmount();
  });

});
