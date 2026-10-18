/**
 * Frontend template-var resolver registry + applyFilters extension tests
 * — Phase 3.1 Plan 03.1-04 Task 2 (ANC-07).
 *
 * Covers:
 *   - registerResolver token-prefix check + duplicate rejection
 *   - v1 resolvers registered at module import (:current_user, :entry_id,
 *     :anchored_track)
 *   - resolveTemplateVar round-trips and fail-soft for unknown tokens
 *   - applyFilters consults resolver registry for :-prefixed rule values
 *   - applyFilters back-compat (no context arg, plain rule values unchanged)
 */

import { describe, it, expect } from 'vitest';
import type { Entry } from '../../../../types';
import {
  registerResolver,
  resolveTemplateVar,
  getRegisteredTokens,
} from '../templateVarResolvers';
import { applyFilters } from '../utils';

describe('templateVarResolvers — Phase 3.1 ANC-07', () => {
  it('registerResolver requires : prefix', () => {
    expect(() => registerResolver('bogus', () => null)).toThrow();
  });

  it('registerResolver rejects duplicates', () => {
    registerResolver(':test_dup_a', () => null);
    expect(() => registerResolver(':test_dup_a', () => null)).toThrow();
  });

  it('v1 resolvers are registered at module import', () => {
    const tokens = new Set(getRegisteredTokens());
    expect(tokens.has(':current_user')).toBe(true);
    expect(tokens.has(':entry_id')).toBe(true);
    expect(tokens.has(':anchored_track')).toBe(true);
  });

  it(':current_user resolves from context.userId', () => {
    expect(resolveTemplateVar(':current_user', { userId: 'u-1' })).toBe('u-1');
  });

  it(':entry_id resolves from context.entryId', () => {
    expect(resolveTemplateVar(':entry_id', { entryId: 'e-1' })).toBe('e-1');
  });

  it(':anchored_track resolves from pre-computed context.anchoredTrackId', () => {
    expect(
      resolveTemplateVar(':anchored_track', { anchoredTrackId: 't-1' })
    ).toBe('t-1');
  });

  it('unknown token returns null (fail-soft)', () => {
    expect(resolveTemplateVar(':no_such_token_xyz', {})).toBeNull();
  });

  it('missing context value returns null (fail-soft)', () => {
    expect(resolveTemplateVar(':current_user', {})).toBeNull();
  });

  it('resolver exception returns null (fail-soft)', () => {
    registerResolver(':boom_xyz', () => {
      throw new Error('boom');
    });
    expect(resolveTemplateVar(':boom_xyz', {})).toBeNull();
  });
});

describe('applyFilters resolver hook — Phase 3.1 ANC-07', () => {
  it('pre-resolves :-prefixed rule values from context', () => {
    const entries = [
      { id: 'e1', custom_fields: { assignee: 'u-1' } },
      { id: 'e2', custom_fields: { assignee: 'u-2' } },
    ] as unknown as Entry[];
    const rules = [{ field: 'assignee', op: 'eq' as const, value: ':current_user' }];
    const out = applyFilters(entries, rules, { userId: 'u-1' });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('e1');
  });

  it('unresolved :-prefixed value yields no matches (fail-soft)', () => {
    const entries = [
      { id: 'e1', custom_fields: { assignee: 'u-1' } },
    ] as unknown as Entry[];
    // No userId in context → :current_user resolves to null → eq comparison
    // against entry assignee='u-1' fails; entry is filtered out.
    const rules = [{ field: 'assignee', op: 'eq' as const, value: ':current_user' }];
    const out = applyFilters(entries, rules, {});
    expect(out).toHaveLength(0);
  });

  it('non-prefixed rule values pass through unchanged (back-compat)', () => {
    const entries = [
      { id: 'e1', custom_fields: { status: 'active' } },
      { id: 'e2', custom_fields: { status: 'archived' } },
    ] as unknown as Entry[];
    const rules = [{ field: 'status', op: 'eq' as const, value: 'active' }];
    // No context arg — legacy call pattern; behavior unchanged.
    const out = applyFilters(entries, rules);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('e1');
  });

  it('callers without context still skip :-prefixed rules (back-compat)', () => {
    const entries = [
      { id: 'e1', custom_fields: { assignee: 'u-1' } },
    ] as unknown as Entry[];
    // Legacy call site: no context, rule value is a template var. The
    // resolver returns null (no userId in default context), so the eq fails.
    const rules = [{ field: 'assignee', op: 'eq' as const, value: ':current_user' }];
    const out = applyFilters(entries, rules);
    expect(out).toHaveLength(0);
  });
});
