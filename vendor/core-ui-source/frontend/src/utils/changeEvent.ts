/**
 * changeEvent — WS-vs-polling actor shape unifier (UX-02 / CONTEXT lock #10).
 *
 * The backend emits TWO actor wire shapes for the same logical
 * ``ChangeEvent``:
 *   - WS broadcast (``ChangeEventEnvelope.to_wire``): nested
 *     ``event.actor.{kind, id, capability}``.
 *   - HTTP polling (``ChangeEventEnvelope.to_wire_flat``): flat
 *     ``event.actor_kind / actor_id / actor_capability`` fields.
 *
 * Per CONTEXT post-research lock #10 the fix lives in the frontend: the
 * backend stays unchanged and the frontend normalizes both inputs into a
 * single ``ActivityEvent`` shape with flat fields.
 *
 * I-UX-02 (docs/INVARIANTS.md): this module is the SOLE normalization
 * point. Every consumer of WS or polling events MUST flow input through
 * ``normalizeChangeEvent``. If the backend ever introduces a third actor
 * shape it MUST be added here in lockstep.
 */

/** Flat-actor activity event — the only shape that flows past the normalizer. */
export interface ActivityEvent {
  id: string;
  ts: string;
  actor_kind: string;
  actor_id: string;
  actor_capability?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  scope?: string;
  before?: unknown;
  after?: unknown;
  details?: Record<string, unknown>;
}

/** Raw input shape — accepts either WS-nested or polling-flat actor fields. */
interface RawChangeEvent {
  id?: unknown;
  ts?: unknown;
  actor?: {
    kind?: unknown;
    id?: unknown;
    capability?: unknown;
  };
  actor_kind?: unknown;
  actor_id?: unknown;
  actor_capability?: unknown;
  action?: unknown;
  resource_type?: unknown;
  resource_id?: unknown;
  scope?: unknown;
  before?: unknown;
  after?: unknown;
  details?: unknown;
  [k: string]: unknown;
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  return String(v);
}

function asOptString(v: unknown): string | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  return typeof v === 'string' ? v : String(v);
}

function asOptRecord(v: unknown): Record<string, unknown> | undefined {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Parse a raw WS or polling wire message into a normalized ActivityEvent.
 *
 * WS broadcasts wrap the event:
 *   `{ type: "change_event", payload: { id, action, ... } }`
 * Polling returns the flat event directly. Ping/pong envelopes are ignored.
 */
export function parseChangeEventWireMessage(raw: unknown): ActivityEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const envelope = raw as Record<string, unknown>;

  if (envelope.type === 'ping' || envelope.type === 'pong') return null;

  if (envelope.type === 'change_event' && envelope.payload) {
    return normalizeChangeEvent(
      envelope.payload as RawChangeEvent,
    );
  }

  return normalizeChangeEvent(envelope as RawChangeEvent);
}

/**
 * Normalize either the WS nested-actor or polling flat-actor shape into the
 * unified ``ActivityEvent`` form. Pure function — no side effects. Never
 * throws: a defensive empty input falls back to actor_kind='system' so the
 * consumer can still render the row instead of crashing.
 */
export function normalizeChangeEvent(raw: RawChangeEvent | null | undefined): ActivityEvent {
  const r = raw ?? {};
  const nested = r.actor && typeof r.actor === 'object' ? r.actor : undefined;
  const nestedKind = nested ? asOptString(nested.kind) : undefined;
  const nestedId = nested ? asOptString(nested.id) : undefined;
  const nestedCap = nested ? asOptString(nested.capability) : undefined;
  const flatKind = asOptString(r.actor_kind);
  const flatId = asOptString(r.actor_id);
  const flatCap = asOptString(r.actor_capability);

  return {
    id: asString(r.id),
    ts: asString(r.ts),
    actor_kind: nestedKind ?? flatKind ?? 'system',
    actor_id: nestedId ?? flatId ?? '',
    actor_capability: nestedCap ?? flatCap ?? undefined,
    action: asString(r.action),
    resource_type: asOptString(r.resource_type),
    resource_id: asOptString(r.resource_id),
    scope: asOptString(r.scope),
    before: r.before,
    after: r.after,
    details: asOptRecord(r.details),
  };
}
