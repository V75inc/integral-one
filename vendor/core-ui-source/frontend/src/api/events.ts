/**
 * events.ts — frontend consumer of Phase 2 ChangeEvent surfaces (UX-02).
 *
 * Provides:
 *   - ``openEventStream(scope, token)`` — opens a WebSocket against the
 *     backend's WS /api/events endpoint (Phase 2 EVT-01).
 *   - ``fetchEventsPage({since, scope, actor_kind?, limit?})`` — axios call
 *     against the polling GET /api/events endpoint (Phase 2 EVT-02). The
 *     response shape is ``{events: ChangeEventEnvelope.to_wire_flat[],
 *     next_cursor, has_more}``; each event is normalized through
 *     ``normalizeChangeEvent`` before crossing the API boundary so callers
 *     always see the unified shape.
 *
 * Hand-mirrored types from
 * ``backend/app/services/change_event_logger.py:60-110`` per the Phase 1
 * AGT-05 convention (no shared schema generator).
 *
 * Plan 07-03 ships the frontend CONSUMER. ZERO backend changes.
 */
import apiClient from './client';
import { mintWsTicket } from './wsTicket';
import { normalizeChangeEvent, type ActivityEvent } from '../utils/changeEvent';

/** Polling page shape (mirrors ``build_paginated_response`` in
 *  ``backend/app/services/pagination.py``). */
export interface EventsPage {
  events: ActivityEvent[];
  next_cursor: string | null;
  has_more: boolean;
  /** Optional — present when the backend pagination knows the total. */
  total?: number;
}

/** Raw WS / polling event shape — kept loose because the input can be either
 *  the WS nested-actor variant or the polling flat-actor variant. The
 *  ``normalizeChangeEvent`` unifier resolves both into ``ActivityEvent``. */
export type EventStreamRaw = Parameters<typeof normalizeChangeEvent>[0];

/** Resolve the WS URL for the events endpoint.
 *
 *  Strategy:
 *  1. If VITE_BACKEND_URL is set, swap http→ws / https→wss against it.
 *  2. Otherwise, use the current page's host (Vite dev-server proxy +
 *     production both work because the WS path is hosted alongside the
 *     REST API in single-origin setups).
 *
 *  Matches the construction used by ``useAgentiveWebSocket`` so the two
 *  WS consumers share the same origin/proxy assumptions. */
function resolveWebSocketUrl(scope: string, ticket: string): string {
  const backendBase = (import.meta as ImportMeta & {
    env?: { VITE_BACKEND_URL?: string };
  }).env?.VITE_BACKEND_URL;
  const params = `ticket=${encodeURIComponent(ticket)}&scope=${encodeURIComponent(scope)}`;
  if (backendBase) {
    // Convert http(s) → ws(s) — preserves :port, /path, etc.
    const wsBase = backendBase.replace(/^http/i, m => (m.toLowerCase() === 'https' ? 'wss' : 'ws'));
    // backend base may or may not have trailing slash; normalize.
    const trimmed = wsBase.replace(/\/+$/, '');
    return `${trimmed}/api/events?${params}`;
  }
  // Same-origin fallback — works through the Vite dev server proxy.
  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.host : 'localhost';
  return `${protocol}//${host}/api/events?${params}`;
}

/**
 * Open a WebSocket against ``WS /api/events?ticket=...&scope=...``.
 *
 * Returns the raw ``WebSocket`` object; the caller (typically
 * ``useEventStream``) wires ``onmessage`` / ``onerror`` / ``onclose`` and
 * owns the reconnect/dedup state machine. Throws synchronously only if the
 * WebSocket constructor itself rejects the URL — the open handshake is
 * still asynchronous.
 */
export async function openEventStream(scope: string): Promise<WebSocket> {
  const ticket = await mintWsTicket();
  if (!ticket) {
    throw new Error('Failed to mint WebSocket ticket');
  }
  const url = resolveWebSocketUrl(scope, ticket);
  return new WebSocket(url);
}

/**
 * Fetch one page of events from ``GET /api/events`` with normalization.
 *
 * The polling endpoint returns events in ASC ``(ts, id)`` order — this
 * matches what ``useEventStream`` needs for its forward-stream replay
 * when WS is unavailable. Every event runs through
 * ``normalizeChangeEvent`` so the polling and WS paths emit the same
 * ``ActivityEvent`` shape downstream.
 */
export async function fetchEventsPage(params: {
  since?: string | null;
  scope: string;
  actor_kind?: string;
  limit?: number;
}): Promise<EventsPage> {
  const query: Record<string, string | number> = {
    scope: params.scope,
  };
  if (params.since) query.since = params.since;
  if (params.actor_kind) query.actor_kind = params.actor_kind;
  if (params.limit !== undefined) query.limit = params.limit;

  const response = await apiClient.get<{
    events?: EventStreamRaw[];
    next_cursor?: string | null;
    has_more?: boolean;
    total?: number;
  }>('/events', { params: query });

  const rawEvents = Array.isArray(response.data?.events) ? response.data.events : [];
  return {
    events: rawEvents.map(normalizeChangeEvent),
    next_cursor: response.data?.next_cursor ?? null,
    has_more: Boolean(response.data?.has_more),
    total: typeof response.data?.total === 'number' ? response.data.total : undefined,
  };
}
