/**
 * normalizeChangeEvent Vitest — TEST-04 Plan 07-05 (UX-02).
 *
 * The normalizer is the SOLE WS-vs-polling actor-shape unifier
 * (I-UX-02, docs/INVARIANTS.md). It accepts EITHER the WS nested-actor
 * shape OR the polling flat-actor shape and emits a single ActivityEvent.
 *
 * Per CONTEXT lock #UX-02 these tests pin both wire shapes + the
 * defensive empty-input fallback + the dual-shape precedence (nested
 * wins when both are present).
 */
import { describe, it, expect } from 'vitest';

import { normalizeChangeEvent, parseChangeEventWireMessage } from '../changeEvent';

describe('normalizeChangeEvent', () => {
  it('flattens the WS nested-actor shape', () => {
    const out = normalizeChangeEvent({
      id: 'ce-1',
      ts: '2026-05-17T00:00:00Z',
      actor: { kind: 'agent', id: 'agt-1', capability: 'filing' },
      action: 'entry.create',
      resource_type: 'Entry',
      resource_id: 'e-1',
      scope: 'track:t-1',
      details: { foo: 'bar' },
    });
    expect(out.actor_kind).toBe('agent');
    expect(out.actor_id).toBe('agt-1');
    expect(out.actor_capability).toBe('filing');
    expect(out.action).toBe('entry.create');
    expect(out.resource_type).toBe('Entry');
    expect(out.resource_id).toBe('e-1');
    expect(out.scope).toBe('track:t-1');
    expect(out.details).toEqual({ foo: 'bar' });
  });

  it('passes the polling flat-actor shape through unchanged', () => {
    const out = normalizeChangeEvent({
      id: 'ce-2',
      ts: '2026-05-17T00:00:00Z',
      actor_kind: 'human',
      actor_id: 'u-1',
      actor_capability: undefined,
      action: 'entry.update',
    });
    expect(out.actor_kind).toBe('human');
    expect(out.actor_id).toBe('u-1');
    expect(out.actor_capability).toBeUndefined();
    expect(out.action).toBe('entry.update');
  });

  it('falls back to actor_kind="system" / actor_id="" on empty input', () => {
    const out = normalizeChangeEvent({});
    expect(out.actor_kind).toBe('system');
    expect(out.actor_id).toBe('');
    expect(out.action).toBe('');
  });

  it('falls back to actor_kind="system" on null input (defensive)', () => {
    const out = normalizeChangeEvent(null as unknown as Parameters<typeof normalizeChangeEvent>[0]);
    expect(out.actor_kind).toBe('system');
    expect(out.actor_id).toBe('');
  });

  it('prefers nested actor over flat when both are present', () => {
    // Defensive — backend should never emit both, but if a forwarder
    // augments a flat polling event with a nested copy, nested wins.
    const out = normalizeChangeEvent({
      id: 'ce-4',
      ts: 'x',
      action: 'x',
      actor: { kind: 'agent', id: 'agt-1', capability: 'cap-1' },
      actor_kind: 'human',
      actor_id: 'u-1',
      actor_capability: 'cap-other',
    });
    expect(out.actor_kind).toBe('agent');
    expect(out.actor_id).toBe('agt-1');
    expect(out.actor_capability).toBe('cap-1');
  });

  it('coerces non-string ts/id/action to strings (defensive)', () => {
    // The wire types are strings, but a permissive Pydantic boundary may
    // emit numeric ts on legacy events; the normalizer must not crash.
    const out = normalizeChangeEvent({
      id: 12345 as unknown as string,
      ts: 67890 as unknown as string,
      action: 100 as unknown as string,
    });
    expect(out.id).toBe('12345');
    expect(out.ts).toBe('67890');
    expect(out.action).toBe('100');
  });

  it('returns undefined for optional string fields when empty', () => {
    // resource_type, resource_id, scope, actor_capability are
    // Optional[str] on the wire; empty values normalize to undefined so
    // downstream JSX can use `?` chaining + the `?` operator.
    const out = normalizeChangeEvent({
      id: 'ce-x',
      ts: 'x',
      action: 'x',
      actor_kind: 'human',
      actor_id: 'u-1',
      resource_type: '',
      resource_id: '',
      scope: '',
      actor_capability: '',
    });
    expect(out.resource_type).toBeUndefined();
    expect(out.resource_id).toBeUndefined();
    expect(out.scope).toBeUndefined();
    expect(out.actor_capability).toBeUndefined();
  });
});

describe('parseChangeEventWireMessage', () => {
  it('unwraps WS change_event envelopes', () => {
    const out = parseChangeEventWireMessage({
      type: 'change_event',
      payload: {
        id: 'ce-ws-1',
        ts: '2026-05-17T00:00:00Z',
        actor: { kind: 'agent', id: 'agt-1' },
        action: 'entry.update',
        resource_id: 'e-1',
        scope: 'track:t-1',
      },
      timestamp: '2026-05-17T00:00:00Z',
    });
    expect(out).not.toBeNull();
    expect(out?.action).toBe('entry.update');
    expect(out?.resource_id).toBe('e-1');
    expect(out?.scope).toBe('track:t-1');
  });

  it('passes through flat polling events', () => {
    const out = parseChangeEventWireMessage({
      id: 'ce-poll-1',
      ts: '2026-05-17T00:00:00Z',
      actor_kind: 'human',
      actor_id: 'u-1',
      action: 'entry.create',
    });
    expect(out?.action).toBe('entry.create');
  });

  it('returns null for ping/pong keepalives', () => {
    expect(parseChangeEventWireMessage({ type: 'ping' })).toBeNull();
    expect(parseChangeEventWireMessage({ type: 'pong' })).toBeNull();
  });
});
