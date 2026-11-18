import { useScopeOptional } from '../context/ScopeContext';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { fetchEventsPage, openEventStream } from '../api/events';
import {
  invalidateAfterAgentWrite,
  invalidateAfterChangeEvents,
} from '../services/graphMutationInvalidation';
import type { StagedChange } from '../features/ai-chat/staging/types';
import { useAuth } from '../context/AuthContext';
import { parseChangeEventWireMessage, type ActivityEvent } from '../utils/changeEvent';

const SEEN_EVENT_CAP = 200;
const SAFETY_POLL_INTERVAL_MS = 15_000;
const EVENT_STREAM_RECONNECT_MAX_MS = 30_000;
const isVisible = () => document.visibilityState !== 'hidden';

/**
 * Broadcasts a normalized governed mutation after its caches are invalidated.
 *
 * Several older list pages still own their data in local state rather than a
 * React Query cache. They use this event to refresh from the same authoritative
 * ChangeEvent stream instead of guessing when a resident write has landed.
 */
export const CHANGE_EVENT_APPLIED = 'integral:change-event-applied';

/**
 * Subscribes to backend ChangeEvents and agent staging completions, then
 * invalidates React Query caches so open entry dialogs and list pages refresh
 * after the resident agent (or any writer) mutates data.
 */
export function useChangeEventInvalidation(): void {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = useScopeOptional()?.scope?.workspaceId;
  const principalId = user?.user_id ?? user?.id;
  const seenIdsRef = useRef(new Set<string>());
  const pollCursorRef = useRef<string | null>(null);
  const pollInFlightRef = useRef(false);
  const pendingReplayRef = useRef<{
    events: ActivityEvent[];
    cursor: string | null;
    applying?: Promise<void>;
  } | null>(null);
  const generationRef = useRef(0);
  const cursorOwnerRef = useRef('');
  const ownerGenerationRef = useRef(0);
  const subscribedRef = useRef(false);

  const rememberEvent = useCallback((id: string): boolean => {
    const seen = seenIdsRef.current;
    if (seen.has(id)) return false;
    seen.add(id);
    if (seen.size > SEEN_EVENT_CAP) {
      const drop = [...seen].slice(0, seen.size - SEEN_EVENT_CAP);
      for (const old of drop) seen.delete(old);
    }
    return true;
  }, []);

  const applyEvents = useCallback(async (events: ActivityEvent[]) => {
    const ownerGeneration = ownerGenerationRef.current;
    const fresh = events.filter(event => event.id && rememberEvent(event.id));
    if (!fresh.length) return;
    try {
      await invalidateAfterChangeEvents(queryClient, fresh);
    } catch (error) {
      if (ownerGeneration === ownerGenerationRef.current) for (const event of fresh) seenIdsRef.current.delete(event.id);
      throw error;
    }
    // Credential renewal restarts the socket, not the workspace subscription.
    // Its already-started reconciliation must still notify legacy list pages.
    if (!subscribedRef.current || ownerGeneration !== ownerGenerationRef.current) return;
    // Legacy list pages need one refresh per resource family, not one per row.
    const families = new Map(fresh.map(event => [event.action?.split('.')[0], event]));
    for (const event of families.values()) window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT_APPLIED, { detail: event }),
    );
  }, [queryClient, rememberEvent]);

  const pollOnce = useCallback(async () => {
    if (!principalId || pollInFlightRef.current || !isVisible()) return;
    const generation = generationRef.current;
    pollInFlightRef.current = true;
    const replay: NonNullable<typeof pendingReplayRef.current> = pendingReplayRef.current ?? { events: [], cursor: pollCursorRef.current };
    const resumePending = pendingReplayRef.current !== null;
    pendingReplayRef.current = replay;
    try {
      // Read the bounded catch-up burst before reconciling active queries.
      // Per-page reconciliation made three history pages trigger three full
      // dashboard reads (Chrome replay trace: 16.540/18.214/19.381 seconds).
      for (let pageNumber = 0; !resumePending && pageNumber < 10; pageNumber += 1) {
        if (generation !== generationRef.current || !isVisible()) break;
        const previousCursor = replay.cursor;
        const page = await fetchEventsPage({
          since: previousCursor,
          // The authenticated scope header selects the workspace. A user:
          // filter would exclude App/Track events that the socket missed.
          limit: 50,
        });
        if (generation !== generationRef.current) return;
        replay.events.push(...page.events);
        replay.cursor = page.resume_cursor ?? page.next_cursor ?? previousCursor;
        if (!page.has_more || !page.next_cursor || page.next_cursor === previousCursor) break;
      }
    } catch {
      /* silent — WS or next poll will retry */
    } finally {
      try {
        if (generation === generationRef.current && isVisible()) {
          // Also reconcile pages received before a later page failed. Keep
          // hidden-tab work pending and commit the cursor only after applying
          // its events, so a failed/paused catch-up cannot skip a mutation.
          // A renewed token may resume this batch while the prior generation
          // is still reconciling. Share that completion before committing it.
          const applying = replay.applying ??= applyEvents(replay.events);
          try { await applying; }
          finally { if (replay.applying === applying) replay.applying = undefined; }
          if (generation === generationRef.current) {
            pollCursorRef.current = replay.cursor;
            pendingReplayRef.current = null;
          }
        }
      } catch {
        /* Keep the unapplied batch/cursor for the next visible poll. */
      } finally {
        if (generation === generationRef.current) pollInFlightRef.current = false;
      }
    }
  }, [principalId, applyEvents]);

  useEffect(() => {
    if (!token || !principalId) {
      ++ownerGenerationRef.current;
      cursorOwnerRef.current = '';
      pollCursorRef.current = null;
      pendingReplayRef.current = null;
      seenIdsRef.current.clear();
      return undefined;
    }

    subscribedRef.current = true;
    const generation = ++generationRef.current;
    const cursorOwner = JSON.stringify([principalId, workspaceId]);
    if (cursorOwnerRef.current !== cursorOwner) {
      ++ownerGenerationRef.current;
      cursorOwnerRef.current = cursorOwner;
      pollCursorRef.current = null;
      pendingReplayRef.current = null;
      seenIdsRef.current.clear();
    }
    pollInFlightRef.current = false;
    let ws: WebSocket | null = null;
    let cancelled = false;
    let safetyPollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let flushing = false;
    const queued = new Map<string, ActivityEvent>();
    const flush = async () => {
      flushTimer = null;
      if (cancelled || flushing || !isVisible()) return;
      flushing = true;
      try { const events = [...queued.values()]; queued.clear(); await applyEvents(events); }
      finally {
        flushing = false;
        if (!cancelled && queued.size && isVisible() && flushTimer === null) flushTimer = setTimeout(() => { void flush(); }, 100);
      }
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer !== null) return;
      const delay = Math.min(
        1_000 * 2 ** reconnectAttempt,
        EVENT_STREAM_RECONNECT_MAX_MS,
      );
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };

    const connect = async () => {
      try {
        ws = await openEventStream(`user:${principalId}`);
        if (cancelled) {
          ws.close();
          return;
        }
        // Backoff resets only once the socket really opens. Resetting when the socket
        // object is merely constructed made a socket that never connects retry every
        // second (a fresh ticket each time) instead of backing off.
        ws.onopen = () => {
          reconnectAttempt = 0;
        };
        ws.onmessage = (event: MessageEvent) => {
          try {
            const raw = JSON.parse(String(event.data)) as unknown;
            const parsedEvent = parseChangeEventWireMessage(raw);
            if (parsedEvent && !cancelled && generation === generationRef.current) {
              queued.set(`${parsedEvent.action?.split('.')[0]}:${parsedEvent.resource_id ?? parsedEvent.id}`, parsedEvent);
              // The durable poll cursor is independent of socket delivery and
              // catches overflow later; keep only a bounded live burst here.
              if (queued.size > 500) queued.delete(queued.keys().next().value!);
              if (flushTimer === null && !flushing && isVisible()) flushTimer = setTimeout(() => { void flush(); }, 100);
            }
          } catch {
            /* ignore malformed payloads */
          }
        };
        ws.onerror = () => {
          /* close drives a bounded reconnect; polling remains a safety net */
        };
        ws.onclose = scheduleReconnect;
      } catch {
        // A failed ticket mint or socket construction is not terminal. Retry
        // the stream with bounded backoff; safety polling fills the gap.
        scheduleReconnect();
      }
    };

    const onVisibility = () => {
      if (isVisible() && queued.size && !flushing && flushTimer === null) void flush();
      if (isVisible() && pendingReplayRef.current) void pollOnce();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void connect();

    safetyPollTimer = setInterval(() => {
      void pollOnce();
    }, SAFETY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      subscribedRef.current = false;
      ++generationRef.current;
      if (flushTimer !== null) clearTimeout(flushTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      if (safetyPollTimer !== null) {
        clearInterval(safetyPollTimer);
      }
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
      }
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, [token, principalId, workspaceId, applyEvents, pollOnce]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<StagedChange>).detail;
      if (!detail || detail.state !== 'consumed') return;
      void invalidateAfterAgentWrite(queryClient, { staged: detail });
    };
    window.addEventListener('integral:staging-state-changed', handler);
    return () => {
      window.removeEventListener('integral:staging-state-changed', handler);
    };
  }, [queryClient]);
}
