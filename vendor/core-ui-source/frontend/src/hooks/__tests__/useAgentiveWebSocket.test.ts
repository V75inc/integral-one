/**
 * The agent-events socket has to come back on its own.
 *
 * It used to be opened once: a server restart or proxy idle-timeout closed
 * it and the app stayed deaf to graph / staging / thread pushes until a
 * reload — while the 30s ping interval kept firing against the dead socket.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

let ticketCounter = 0;
vi.mock('../../api/wsTicket', () => ({
  mintWsTicket: vi.fn(async () => `ticket-${++ticketCounter}`),
}));
vi.mock('../../context/AgentiveContext', () => ({
  useAgentive: () => ({ enabled: true }),
}));

import { mintWsTicket } from '../../api/wsTicket';
import { useAgentiveWebSocket } from '../useAgentiveWebSocket';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = FakeWebSocket.CLOSED;
  });

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  drop() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

/** Let the async `mintWsTicket` → `new WebSocket` chain run. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  ticketCounter = 0;
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('useAgentiveWebSocket', () => {
  it('reconnects after a close, re-minting the ticket', async () => {
    const { result } = renderHook(() => useAgentiveWebSocket());
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const first = FakeWebSocket.instances[0];
    expect(first.url).toContain('ticket=ticket-1');

    act(() => first.open());
    expect(result.current.connected).toBe(true);

    act(() => first.drop());
    expect(result.current.connected).toBe(false);

    // First backoff step is 1s (+10% jitter).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(mintWsTicket).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1].url).toContain('ticket=ticket-2');

    act(() => FakeWebSocket.instances[1].open());
    expect(result.current.connected).toBe(true);
  });

  it('backs off between failed attempts', async () => {
    renderHook(() => useAgentiveWebSocket());
    await settle();
    act(() => FakeWebSocket.instances[0].drop());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
    act(() => FakeWebSocket.instances[1].drop());

    // Second step is 2s: nothing yet at 1.2s, a new socket by 2.3s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(FakeWebSocket.instances).toHaveLength(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it('stops pinging a socket once it has closed', async () => {
    renderHook(() => useAgentiveWebSocket());
    await settle();
    const first = FakeWebSocket.instances[0];
    act(() => first.open());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(first.send).toHaveBeenCalledTimes(1);

    act(() => first.drop());
    // Pretend the dead socket looks open again: a leaked interval would
    // still send on it. The reconnect below opens a NEW socket.
    first.readyState = FakeWebSocket.OPEN;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(first.send).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending reconnect on unmount', async () => {
    const { unmount } = renderHook(() => useAgentiveWebSocket());
    await settle();
    act(() => FakeWebSocket.instances[0].drop());
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(mintWsTicket).toHaveBeenCalledTimes(1);
  });

  it('retries when no ticket could be minted', async () => {
    vi.mocked(mintWsTicket).mockResolvedValueOnce(null);
    renderHook(() => useAgentiveWebSocket());
    await settle();
    expect(FakeWebSocket.instances).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(mintWsTicket).toHaveBeenCalledTimes(2);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('does not open a socket when unmounted during ticket mint', async () => {
    let resolveTicket!: (value: string) => void;
    vi.mocked(mintWsTicket).mockImplementationOnce(
      () =>
        new Promise<string>(resolve => {
          resolveTicket = resolve;
        }),
    );

    const { unmount } = renderHook(() => useAgentiveWebSocket());
    // Effect started; ticket still pending.
    expect(FakeWebSocket.instances).toHaveLength(0);

    unmount();
    await act(async () => {
      resolveTicket('ticket-late');
      await Promise.resolve();
      await Promise.resolve();
    });

    // cancelled is set before the ticket resolves, so connect returns
    // without constructing a WebSocket.
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
