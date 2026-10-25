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
import { parseChangeEventWireMessage } from '../utils/changeEvent';

const SEEN_EVENT_CAP = 200;
const SAFETY_POLL_INTERVAL_MS = 15_000;
const EVENT_STREAM_RECONNECT_MAX_MS = 30_000;

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
  const generationRef = useRef(0);
  const cursorOwnerRef = useRef('');

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

  const applyEvents = useCallback(async (events: import('../utils/changeEvent').ActivityEvent[]) => {
    const generation = generationRef.current;
    const fresh = events.filter(event => event.id && rememberEvent(event.id));
    if (!fresh.length) return;
    await invalidateAfterChangeEvents(queryClient, fresh);
    if (generation !== generationRef.current) return;
    // Legacy list pages need one refresh per resource family, not one per row.
    const families = new Map(fresh.map(event => [event.action?.split('.')[0], event]));
    for (const event of families.values()) window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT_APPLIED, { detail: event }),
    );
  }, [queryClient, rememberEvent]);

  const pollOnce = useCallback(async () => {
    if (!principalId || pollInFlightRef.current || document.visibilityState === 'hidden') return;
    const generation = generationRef.current;
    pollInFlightRef.current = true;
    try {

      for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
        if (generation !== generationRef.current) return;
        const previousCursor = pollCursorRef.current;
        const page = await fetchEventsPage({
          since: pollCursorRef.current,
          scope: `user:${principalId}`,
          limit: 50,
        });
        if (generation !== generationRef.current) return;
        await applyEvents(page.events);
        if (generation !== generationRef.current) return;
        pollCursorRef.current = page.resume_cursor ?? page.next_cursor ?? previousCursor;
        if (!page.has_more || !page.next_cursor || page.next_cursor === previousCursor) break;
      }
    } catch {
      /* silent — WS or next poll will retry */
    } finally {
      if (generation === generationRef.current) pollInFlightRef.current = false;
    }
  }, [principalId, workspaceId, applyEvents]);

  useEffect(() => {
    if (!token || !principalId) return undefined;

    const generation = ++generationRef.current;
    const cursorOwner = JSON.stringify([principalId, workspaceId]);
    if (cursorOwnerRef.current !== cursorOwner) {
      cursorOwnerRef.current = cursorOwner;
      pollCursorRef.current = null;
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
    const queued = new Map<string, import('../utils/changeEvent').ActivityEvent>();
    const isVisible = () => document.visibilityState !== 'hidden';
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
        reconnectAttempt = 0;
        ws.onmessage = (event: MessageEvent) => {
          try {
            const raw = JSON.parse(String(event.data)) as unknown;
            const parsedEvent = parseChangeEventWireMessage(raw);
            if (parsedEvent && !cancelled && generation === generationRef.current) {
              queued.set(`${parsedEvent.action?.split('.')[0]}:${parsedEvent.resource_id ?? parsedEvent.id}`, parsedEvent);
              // The durable poll cursor is independent of socket delivery and
              // catches overflow later; keep only a bounded live burst here.
              if (queued.size > 500) queued.delete(queued.keys().next().value!);
              if (flushTimer === null && !flushing && document.visibilityState !== 'hidden') flushTimer = setTimeout(() => { void flush(); }, 100);
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
      if (document.visibilityState !== 'hidden' && queued.size && !flushing && flushTimer === null) void flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    void connect();

    safetyPollTimer = setInterval(() => {
      void pollOnce();
    }, SAFETY_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
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
  }, [token, principalId, applyEvents, pollOnce]);

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
