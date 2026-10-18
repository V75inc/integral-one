/**
 * Phase 8 Plan 08-01 — Vitest coverage for policiesApi.
 *
 * Asserts each method calls apiClient with the correct path and HTTP
 * method, and forwards params/body as configured. Mirrors the helpers.test.ts
 * spy-on-axios idiom.
 *
 * Threat coverage (T-08-01-S01): `create` body shape MUST NOT include a
 * `created_by` field — backend `extra:forbid` would 422, but defence-in-depth
 * is to keep the field absent at the type boundary. The PolicyCreate
 * interface in policies.ts intentionally omits it; this test asserts the
 * payload posted matches the body argument verbatim (no fabricated fields).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import api from './client';
import {
  policiesApi,
  type PolicyCreate,
  type PolicyResponse,
  type PolicyUpdate,
} from './policies';

const RESPONSE_FIXTURE: PolicyResponse = {
  id: 'pol-1',
  subject_kind: 'agent',
  subject_id: 'agt-1',
  scope: '*',
  actions: ['entry.create'],
  entry_types: [],
  tags: [],
  requires_human_approval: false,
  is_active: true,
  created_at: '2026-05-17T00:00:00Z',
  updated_at: '2026-05-17T00:00:00Z',
  created_by: 'user-1',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('policiesApi.list', () => {
  it('GETs /policies and returns the wire array', async () => {
    const getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ data: [RESPONSE_FIXTURE] } as never);
    const result = await policiesApi.list();
    expect(getSpy).toHaveBeenCalledWith('/policies', { params: undefined });
    expect(result).toEqual([RESPONSE_FIXTURE]);
  });

  it('forwards subject_kind / subject_id filter params', async () => {
    const getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ data: [] } as never);
    await policiesApi.list({ subject_kind: 'agent', subject_id: 'agt-1' });
    expect(getSpy).toHaveBeenCalledWith('/policies', {
      params: { subject_kind: 'agent', subject_id: 'agt-1' },
    });
  });
});

describe('policiesApi.get', () => {
  it('GETs /policies/{id} and returns the policy', async () => {
    const getSpy = vi
      .spyOn(api, 'get')
      .mockResolvedValueOnce({ data: RESPONSE_FIXTURE } as never);
    const result = await policiesApi.get('pol-1');
    expect(getSpy).toHaveBeenCalledWith('/policies/pol-1');
    expect(result).toEqual(RESPONSE_FIXTURE);
  });
});

describe('policiesApi.create', () => {
  it('POSTs /policies with the body verbatim (no created_by injection)', async () => {
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ data: RESPONSE_FIXTURE } as never);
    const body: PolicyCreate = {
      subject_kind: 'agent',
      subject_id: 'agt-1',
      scope: '*',
      actions: ['entry.create'],
      entry_types: [],
      tags: [],
      requires_human_approval: false,
      is_active: true,
    };
    const result = await policiesApi.create(body);
    expect(postSpy).toHaveBeenCalledWith('/policies', body);
    // T-08-01-S01 mitigation — the posted payload object MUST NOT contain
    // `created_by`. Backend would 422 via extra:forbid; assert frontend
    // doesn't introduce it.
    const posted = postSpy.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(posted, 'created_by')).toBe(false);
    expect(result).toEqual(RESPONSE_FIXTURE);
  });

  it('accepts minimal body (subject_id only)', async () => {
    const postSpy = vi
      .spyOn(api, 'post')
      .mockResolvedValueOnce({ data: RESPONSE_FIXTURE } as never);
    const body: PolicyCreate = { subject_id: 'agt-2' };
    await policiesApi.create(body);
    expect(postSpy).toHaveBeenCalledWith('/policies', body);
  });
});

describe('policiesApi.patch', () => {
  it('PATCHes /policies/{id} with the partial update body', async () => {
    const patchSpy = vi
      .spyOn(api, 'patch')
      .mockResolvedValueOnce({ data: RESPONSE_FIXTURE } as never);
    const body: PolicyUpdate = { requires_human_approval: true };
    const result = await policiesApi.patch('pol-1', body);
    expect(patchSpy).toHaveBeenCalledWith('/policies/pol-1', body);
    expect(result).toEqual(RESPONSE_FIXTURE);
  });
});

describe('policiesApi.delete', () => {
  it('DELETEs /policies/{id} and resolves void', async () => {
    const deleteSpy = vi
      .spyOn(api, 'delete')
      .mockResolvedValueOnce({ data: undefined } as never);
    const result = await policiesApi.delete('pol-1');
    expect(deleteSpy).toHaveBeenCalledWith('/policies/pol-1');
    expect(result).toBeUndefined();
  });
});
