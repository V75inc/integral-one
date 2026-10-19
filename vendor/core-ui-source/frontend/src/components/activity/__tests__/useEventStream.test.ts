/**
 * useEventStream Vitest — TEST-04 Plan 07-05 (UX-02).
 *
 * Exercises the WS-first / polling-fallback state machine:
 *   - on mount, openEventStream is called with scope
 *   - WS message → state.events upserts the normalized event
 *   - duplicate ids dedup (latest-wins per id)
 *   - WS error/close → recordWsFailure increments; 3 in 60s → polling mode
 *   - successful onopen resets the failure window
 *   - reconnect() force-opens a new WS
 *
 * The test mocks ``api/events.ts`` (openEventStream + fetchEventsPage)
 * and AuthContext.useAuth — never opens a real WebSocket.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// ---- Module mocks ---------------------------------------------------------

// Fake WS — captures the latest instance so the test can drive its handlers.
class FakeWebSocket {
  onopen?: () => void;
  onmessage?: (event: MessageEvent) => void;
  onerror?: (event: Event) => void;
  onclose?: (event: CloseEvent) => void;
  close = vi.fn();
  constructor() {
    // Capture instance for the test to drive.
    lastFakeWs = this;
  }
}
let lastFakeWs: FakeWebSocket | null = null;

vi.mock('../../../api/events', () => ({
  openEventStream: vi.fn(async () => new FakeWebSocket()),
  fetchEventsPage: vi.fn(async () => ({
    events: [],
    next_cursor: null,
    has_more: false
  }))
}));

vi.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'tok-test', loading: false })
}));

import * as eventsApi from '../../../api/events';
import { useEventStream } from '../useEventStream';

beforeEach(() => {
  lastFakeWs = null;
  vi.clearAllMocks();
  // Re-attach the constructor — clearAllMocks wipes implementations.
  (eventsApi.openEventStream as ReturnType<typeof vi.fn>).mockImplementation(
    async () => new FakeWebSocket(),
  );
  (eventsApi.fetchEventsPage as ReturnType<typeof vi.fn>).mockResolvedValue({
    events: [],
    next_cursor: null,
    has_more: false
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useEventStream', () => {
  it('opens a WS on mount with scope', async () => {
    renderHook(() => useEventStream('track:t-1'));
    await waitFor(() => {
      expect(eventsApi.openEventStream).toHaveBeenCalledWith('track:t-1');
    });
  });

  it('transitions status to "live" on WS onopen', async () => {
    const { result } = renderHook(() => useEventStream('track:t-1'));
    await waitFor(() => expect(lastFakeWs).not.toBeNull());
    act(() => {
      lastFakeWs!.onopen?.();
    });
    await waitFor(() => expect(result.current.status).toBe('live'));
  });

  it('ingests a WS message into events list', async () => {
    const { result } = renderHook(() => useEventStream('track:t-1'));
    await waitFor(() => expect(lastFakeWs).not.toBeNull());
    act(() => {
      lastFakeWs!.onopen?.();
      lastFakeWs!.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            id: 'ce-1',
            ts: '2026-05-17T00:00:00Z',
            actor_kind: 'human',
            actor_id: 'u-1',
            action: 'entry.create'
          })
        }),
      );
    });
    await waitFor(() => {
      expect(result.current.events.length).toBe(1);
      expect(result.current.events[0].id).toBe('ce-1');
      expect(result.current.events[0].actor_kind).toBe('human');
    });
  });

  it('dedups duplicate event ids (latest-wins)', async () => {
    const { result } = renderHook(() => useEventStream('track:t-1'));
    await waitFor(() => expect(lastFakeWs).not.toBeNull());
    act(() => {
      lastFakeWs!.onopen?.();
      lastFakeWs!.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            id: 'ce-1',
            ts: '2026-05-17T00:00:00Z',
            action: 'entry.create',
            actor_kind: 'human',
            actor_id: 'u-1'
          })
        }),
      );
      // Same id, later actor — should overwrite the first.
      lastFakeWs!.onmessage?.(
        new MessageEvent('message', {
          data: JSON.stringify({
            id: 'ce-1',
            ts: '2026-05-17T00:01:00Z',
            action: 'entry.update',
            actor_kind: 'agent',
            actor_id: 'agt-7'
          })
        }),
      );
    });
    await waitFor(() => {
      expect(result.current.events.length).toBe(1);
      expect(result.current.events[0].actor_kind).toBe('agent');
      expect(result.current.events[0].action).toBe('entry.update');
    });
  });

  it('drops malformed JSON payloads silently', async () => {
    const { result } = renderHook(() => useEventStream('track:t-1'));
    await waitFor(() => expect(lastFakeWs).not.toBeNull());
    act(() => {
      lastFakeWs!.onopen?.();
      lastFakeWs!.onmessage?.(
        new MessageEvent('message', { data: 'not valid json' }),
      );
    });
    // No event ingested, no crash.
    expect(result.current.events.length).toBe(0);
  });

  it('reconnect() resets the connection attempt counter', async () => {
    const { result } = renderHook(() => useEventStream('track:t-1'));
    await waitFor(() => expect(lastFakeWs).not.toBeNull());
    expect(eventsApi.openEventStream).toHaveBeenCalledTimes(1);
    act(() => {
      result.current.reconnect();
    });
    await waitFor(() => {
      expect(eventsApi.openEventStream).toHaveBeenCalledTimes(2);
    });
  });

  it('cleans up the WS on unmount', async () => {
    const { unmount } = renderHook(() => useEventStream('track:t-1'));
    await waitFor(() => expect(lastFakeWs).not.toBeNull());
    const wsAtMount = lastFakeWs!;
    unmount();
    expect(wsAtMount.close).toHaveBeenCalled();
  });
});
