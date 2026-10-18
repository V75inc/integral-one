import { useEffect, useRef, useState } from 'react';

import { mintWsTicket } from '../api/wsTicket';
import { useAgentive } from '../context/AgentiveContext';

/** Exponential backoff schedule with 10% jitter — capped at 30s. Counter
 *  resets on every successful open. Mirrors `useEventStream`'s schedule;
 *  that hook's reconnect is entangled with its polling fallback, so the
 *  schedule is duplicated here rather than shared. */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const PING_INTERVAL_MS = 30_000;

export function nextAgentiveReconnectDelay(attempt: number): number {
  const idx = Math.min(attempt, RECONNECT_DELAYS_MS.length - 1);
  const base = RECONNECT_DELAYS_MS[idx];
  return base + base * 0.1 * Math.random();
}

/**
 * Keeps one `/ws/agent-events` socket open for the authed session and fans
 * its frames out as window events.
 *
 * The socket used to be opened once and never again: any close (server
 * restart, proxy idle timeout, laptop lid) left the app silently deaf to
 * graph / staging / thread pushes until a reload — while the ping interval
 * kept firing against a CLOSED socket. Now a close schedules a reconnect
 * with backoff, each attempt re-mints its ticket (they are single-use and
 * short-lived), and the ping timer dies with the socket it belongs to.
 */
export function useAgentiveWebSocket() {
  const { enabled } = useAgentive();
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let attempt = 0;
    let pingInterval: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const stopPing = () => {
      if (pingInterval !== null) {
        clearInterval(pingInterval);
        pingInterval = null;
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) return;
      const delay = nextAgentiveReconnectDelay(attempt);
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (cancelled) return;
      // Tickets are single-use: a fresh one per attempt, never a replay.
      const ticket = await mintWsTicket();
      if (cancelled) return;
      if (!ticket) {
        scheduleReconnect();
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/agent-events?ticket=${encodeURIComponent(ticket)}`;

      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        // WebSocket not available / refused synchronously.
        scheduleReconnect();
        return;
      }
      // Ticket await can race effect cleanup: if we were cancelled while
      // minting, close immediately so the socket never leaks.
      if (cancelled) {
        ws.close();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        attempt = 0;
        setConnected(true);
        stopPing();
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL_MS);
      };
      ws.onclose = () => {
        stopPing();
        if (wsRef.current === ws) wsRef.current = null;
        if (cancelled) return;
        setConnected(false);
        scheduleReconnect();
      };
      ws.onerror = () => {
        // `onclose` follows every error in the browser; nothing to do here
        // beyond letting the close path schedule the retry.
      };

      ws.onmessage = (event) => {
        try {
          const agentEvent = JSON.parse(event.data);
          if (agentEvent.type === 'graph_changed') {
            window.dispatchEvent(
              new CustomEvent('integral:graph-changed', {
                detail: agentEvent.payload,
              }),
            );
          }
          if (agentEvent.type === 'staging_created') {
            // Distinct from `staging_state_changed` on purpose: listeners of
            // that event treat it as a transition on a token they already
            // hold, and `useChangeEventInvalidation` invalidates caches on
            // it. A newly minted change is neither.
            window.dispatchEvent(
              new CustomEvent('integral:staging-created', {
                detail: agentEvent.payload,
              }),
            );
          }
          if (agentEvent.type === 'staging_state_changed') {
            window.dispatchEvent(
              new CustomEvent('integral:staging-state-changed', {
                detail: agentEvent.payload,
              }),
            );
          }
          if (agentEvent.type === 'thread_stream_update') {
            window.dispatchEvent(
              new CustomEvent('integral:thread-stream-update', {
                detail: agentEvent.payload,
              }),
            );
          }
        } catch {
          // Ignore malformed messages
        }
      };
    };

    void connect();

    return () => {
      cancelled = true;
      stopPing();
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
    };
  }, [enabled]);

  return { connected };
}
