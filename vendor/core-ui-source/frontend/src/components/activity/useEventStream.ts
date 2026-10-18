/**
 * useEventStream — UX-02 WS-first + polling-fallback state machine.
 *
 * Strategy (CONTEXT post-research lock + 07-RESEARCH §Q14):
 *   1. Open WS against ``WS /api/events?scope=...&token=...``.
 *   2. On successful open → status='live'; dedup ws messages into a
 *      Map<event_id, ActivityEvent>; setEvents from the sorted map.
 *   3. On WS error/close → record the failure timestamp; schedule a
 *      reconnect using RECONNECT_DELAYS_MS = [1s, 2s, 4s, 8s, 16s, 30s]
 *      with 10% jitter (counter resets on successful open).
 *   4. If we accrue 3 failures within a 60s window → enter polling mode
 *      (status='polling') and pump pages via fetchEventsPage on a cadence.
 *      Polling continues until the NEXT successful WS open, at which
 *      point the polling timer is cancelled.
 *   5. Both ws messages and polling pages flow through
 *      ``normalizeChangeEvent`` (centralized in the events.ts API
 *      client + utils/changeEvent.ts) before reaching the dedup Map.
 *      Per id, the LATEST source wins (07-RESEARCH Pitfall 4).
 *
 * Cleanup on unmount: ws.close + clearTimeout + clearInterval for any
 * outstanding reconnect / polling work.
 *
 * I-UX-02 (docs/INVARIANTS.md): all WS + polling events flow through the
 * normalizer before reaching this hook's state — backend stays unchanged.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchEventsPage, openEventStream } from '../../api/events';
import { useAuth } from '../../context/AuthContext';
import { parseChangeEventWireMessage, type ActivityEvent } from '../../utils/changeEvent';

export type EventStreamStatus = 'connecting' | 'live' | 'polling' | 'disconnected';

/** Exponential backoff schedule with 10% jitter — capped at 30s.
 *  Counter resets on every successful WS open. */
const RECONNECT_DELAYS_MS = [1000, 2000, 4000, 8000, 16000, 30000];
const FAILURE_WINDOW_MS = 60_000;
const FAILURE_THRESHOLD = 3;
const POLLING_INTERVAL_MS = 5_000;
/** Background safety-poll cadence used even when WS is live. Catches events
 *  silently dropped by the WS broadcast path (e.g. per-subscriber permission
 *  re-checks, multi-process subscription-registry isolation, brief network
 *  hiccups that don't trip onerror). Cheap because the dedup map drops
 *  anything already delivered live. */
const SAFETY_POLL_INTERVAL_MS = 15_000;
/** Max time the WebSocket constructor is allowed to dwell in CONNECTING
 *  before we treat it as a failure. Browsers will eventually time out
 *  on their own, but the default is platform-dependent and can stretch
 *  to ~minutes — long enough that the user reads "Connecting…" and
 *  concludes the feature is broken. Aborting at 8s lets the
 *  recordWsFailure → scheduleReconnect → polling-fallback machinery
 *  kick in within the same UX timescale as a real onerror. */
const CONNECTION_TIMEOUT_MS = 8_000;

interface UseEventStreamResult {
  /** Sorted ascending by (ts, id) — same order the backend polling endpoint emits. */
  events: ActivityEvent[];
  status: EventStreamStatus;
  /** Force a reconnect attempt (resets the failure window and attempt counter). */
  reconnect: () => void;
}

/** Compute a sorted event list from the dedup map. ASC by (ts, id) — matches
 *  the polling endpoint's forward-stream contract so manual scroll-back feels
 *  natural and most-recent-at-bottom is consistent regardless of source. */
function sortedFromMap(map: Map<string, ActivityEvent>): ActivityEvent[] {
  const arr = Array.from(map.values());
  arr.sort((a, b) => {
    if (a.ts !== b.ts) return a.ts.localeCompare(b.ts);
    return a.id.localeCompare(b.id);
  });
  return arr;
}

/** RECONNECT_DELAYS_MS[min(attempt, last)] + up to 10% jitter. */
function nextReconnectDelay(attempt: number): number {
  const idx = Math.min(attempt, RECONNECT_DELAYS_MS.length - 1);
  const base = RECONNECT_DELAYS_MS[idx];
  const jitter = base * 0.1 * Math.random();
  return base + jitter;
}

export function useEventStream(scope: string): UseEventStreamResult {
  const { token } = useAuth();
  const [status, setStatus] = useState<EventStreamStatus>('connecting');
  const [events, setEvents] = useState<ActivityEvent[]>([]);

  // Refs used by the state machine — kept out of useState so we can mutate
  // without triggering re-renders and read latest values inside async callbacks.
  const dedupRef = useRef<Map<string, ActivityEvent>>(new Map());
  const wsRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const failureTimestampsRef = useRef<number[]>([]);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Connection-open watchdog — fires if onopen hasn't run within
   *  CONNECTION_TIMEOUT_MS so a WS stuck in CONNECTING (e.g. dev-proxy
   *  not forwarding the upgrade) still routes through the
   *  recordWsFailure → polling-fallback path. */
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyPollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingCursorRef = useRef<string | null>(null);
  const pollingInFlightRef = useRef(false);
  const teardownRef = useRef(false);
  // Wrap the WS open path in a ref so reconnect/recovery callbacks can call
  // it from inside other callbacks without ESLint warnings about TDZ.
  const openWsRef = useRef<(() => void) | null>(null);

  /** Push one (possibly already-seen) event into the dedup map and refresh
   *  the rendered list. Latest-wins per id — newer arrival overwrites older. */
  const ingestEvent = useCallback((evt: ActivityEvent) => {
    if (!evt.id) return; // Defensive — backend always assigns an id, but skip empties.
    dedupRef.current.set(evt.id, evt);
    setEvents(sortedFromMap(dedupRef.current));
  }, []);

  /** Stop the polling loop (if running). Called whenever WS is healthy again. */
  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current !== null) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
  }, []);

  /** Run one polling tick. Walks forward from pollingCursorRef until has_more
   *  is false. Each event is already normalized inside fetchEventsPage. */
  const pollOnce = useCallback(async () => {
    if (pollingInFlightRef.current) return;
    if (teardownRef.current) return;
    pollingInFlightRef.current = true;
    try {
      // Walk forward in one tick until the backend says no more. The page cap
      // is enforced server-side; if a busy track emits many events between
      // ticks, we'll catch up across multiple loops within one interval.

      while (true) {
        const page = await fetchEventsPage({
          since: pollingCursorRef.current,
          scope,
          limit: 50
        });
        for (const evt of page.events) {
          ingestEvent(evt);
        }
        pollingCursorRef.current = page.next_cursor;
        if (!page.has_more || !page.next_cursor) break;
      }
    } catch {
      // Polling failures are silent — the user already sees status='polling';
      // we'll try again next tick. Surfacing a toast here would spam users
      // when the backend is briefly unavailable.
    } finally {
      pollingInFlightRef.current = false;
    }
  }, [ingestEvent, scope]);

  /** Enter polling mode — start the interval and run one immediate tick. */
  const startPolling = useCallback(() => {
    if (pollingTimerRef.current !== null) return;
    setStatus('polling');
    void pollOnce();
    pollingTimerRef.current = setInterval(() => {
      void pollOnce();
    }, POLLING_INTERVAL_MS);
  }, [pollOnce]);

  /** Record a WS failure and decide whether to enter polling mode. */
  const recordWsFailure = useCallback(() => {
    const now = Date.now();
    failureTimestampsRef.current = failureTimestampsRef.current.filter(
      t => now - t < FAILURE_WINDOW_MS,
    );
    failureTimestampsRef.current.push(now);
    if (failureTimestampsRef.current.length >= FAILURE_THRESHOLD) {
      startPolling();
    } else {
      setStatus('disconnected');
    }
  }, [startPolling]);

  /** Schedule the next reconnect attempt with backoff + jitter. */
  const scheduleReconnect = useCallback(() => {
    if (teardownRef.current) return;
    if (reconnectTimerRef.current !== null) return; // Already scheduled.
    const delay = nextReconnectDelay(attemptRef.current);
    attemptRef.current += 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      const fn = openWsRef.current;
      if (fn) fn();
    }, delay);
  }, []);

  /** Open a WS connection and wire its lifecycle. Called from useEffect on
   *  mount and from the reconnect schedule. */
  const openWs = useCallback(() => {
    if (teardownRef.current) return;
    if (!token) {
      // No token yet (e.g. before AuthContext hydrates). Defer — useEffect
      // below will re-trigger once token becomes available.
      setStatus('disconnected');
      return;
    }
    // Close any stale prior connection to avoid leaking handlers.
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    }
    setStatus('connecting');
    void (async () => {
      let ws: WebSocket;
      try {
        ws = await openEventStream(scope);
      } catch {
        recordWsFailure();
        scheduleReconnect();
        return;
      }
      if (teardownRef.current) return;
      wsRef.current = ws;
      // Watchdog: if the socket dwells in CONNECTING beyond
      // CONNECTION_TIMEOUT_MS, treat it as a failure. Otherwise a Vite-
      // proxy misconfiguration (or a backend that never accepts the
      // upgrade) leaves the hook on status='connecting' indefinitely,
      // never crosses FAILURE_THRESHOLD, and never enters polling mode.
      if (connectionTimeoutRef.current !== null) {
        clearTimeout(connectionTimeoutRef.current);
      }
      connectionTimeoutRef.current = setTimeout(() => {
        connectionTimeoutRef.current = null;
        if (teardownRef.current) return;
        // Only act if the WS is still trying to connect — once onopen
        // fires we set status='live' and the timeout is moot.
        if (
          wsRef.current === ws &&
          typeof WebSocket !== 'undefined' &&
          ws.readyState === WebSocket.CONNECTING
        ) {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          wsRef.current = null;
          recordWsFailure();
          scheduleReconnect();
        }
      }, CONNECTION_TIMEOUT_MS);
      const clearConnectionTimeout = () => {
        if (connectionTimeoutRef.current !== null) {
          clearTimeout(connectionTimeoutRef.current);
          connectionTimeoutRef.current = null;
        }
      };
      ws.onopen = () => {
        clearConnectionTimeout();
        if (teardownRef.current) return;
        attemptRef.current = 0;
        failureTimestampsRef.current = [];
        stopPolling();
        setStatus('live');
        // History backfill: WS only pushes events that occur after connect.
        // Without this, a freshly-mounted panel sits empty until the next
        // broadcast fires — and any silent gap in the broadcast path leaves
        // the user staring at "Live" with no rows. One polling page on open
        // seeds the dedup map from the persisted DBLog history; subsequent
        // live broadcasts overwrite by id via ingestEvent's latest-wins.
        void (async () => {
          if (teardownRef.current) return;
          try {
            const page = await fetchEventsPage({
              since: pollingCursorRef.current,
              scope,
              limit: 50
            });
            if (teardownRef.current) return;
            for (const evt of page.events) {
              ingestEvent(evt);
            }
            pollingCursorRef.current = page.next_cursor;
          } catch {
            // Backfill is best-effort; live WS continues regardless.
          }
        })();
      };
      ws.onmessage = (event: MessageEvent) => {
        if (teardownRef.current) return;
        try {
          const raw = JSON.parse(String(event.data)) as unknown;
          const normalized = parseChangeEventWireMessage(raw);
          if (!normalized) return;
          ingestEvent(normalized);
        } catch {
          // Malformed payload — drop silently. Real backend events are JSON.
        }
      };
      const handleEnd = () => {
        clearConnectionTimeout();
        if (teardownRef.current) return;
        wsRef.current = null;
        recordWsFailure();
        scheduleReconnect();
      };
      ws.onerror = handleEnd;
      ws.onclose = handleEnd;
    })();
  }, [scope, token, ingestEvent, recordWsFailure, scheduleReconnect, stopPolling]);

  // Keep openWsRef pointing at the latest closure so async callbacks can
  // invoke it without recreating the callback graph.
  useEffect(() => {
    openWsRef.current = openWs;
  }, [openWs]);

  // Mount + scope/token change → open WS. Tear down on unmount.
  useEffect(() => {
    teardownRef.current = false;
    attemptRef.current = 0;
    failureTimestampsRef.current = [];
    pollingCursorRef.current = null;
    dedupRef.current = new Map();
    setEvents([]);

    openWs();

    // Background safety poll — runs regardless of WS state so silent
    // broadcast drops (e.g. multi-process registry isolation, per-subscriber
    // permission re-checks denying) do not leave the panel permanently
    // missing events. Dedup map keeps live-pushed rows authoritative.
    safetyPollTimerRef.current = setInterval(() => {
      void pollOnce();
    }, SAFETY_POLL_INTERVAL_MS);

    return () => {
      teardownRef.current = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (connectionTimeoutRef.current !== null) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      if (safetyPollTimerRef.current !== null) {
        clearInterval(safetyPollTimerRef.current);
        safetyPollTimerRef.current = null;
      }
      stopPolling();
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
    // openWs / stopPolling identities are stable across renders (memoized via
    // useCallback with stable deps) so it's safe to omit them — but keeping
    // them in deps is honest about what this effect depends on.
  }, [openWs, stopPolling, pollOnce]);

  /** Force-reconnect — reset backoff and try again immediately. */
  const reconnect = useCallback(() => {
    if (teardownRef.current) return;
    attemptRef.current = 0;
    failureTimestampsRef.current = [];
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    openWs();
  }, [openWs]);

  return useMemo(
    () => ({ events, status, reconnect }),
    [events, status, reconnect],
  );
}
