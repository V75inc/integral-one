import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 'user-1' } }),
}));

vi.mock('../../api/events', () => ({
  fetchEventsPage: vi.fn(),
  openEventStream: vi.fn(),
}));

vi.mock('../../services/graphMutationInvalidation', () => ({
  invalidateAfterAgentWrite: vi.fn(),
  invalidateAfterChangeEvent: vi.fn(),
}));

import { openEventStream } from '../../api/events';
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
});
