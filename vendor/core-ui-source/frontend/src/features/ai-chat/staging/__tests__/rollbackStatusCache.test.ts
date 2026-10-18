/**
 * One answer per token, shared by everyone who asks.
 *
 * Undo eligibility is asked about the same token from two places at once — the
 * approval card and the message-level undo affordance — and both are right to
 * ask. Each asking separately made `rollback-status` the noisiest call in the
 * app: measured at four requests per consumed card per transcript load.
 *
 * Dedupe rather than delete a caller. The correctness risk is a stale "you can
 * still undo this", so the invalidation test matters as much as the count.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../api/agentive', () => ({
  getStagingRollbackStatus: vi.fn(),
}));

import * as api from '../../../../api/agentive';
import {
  getRollbackStatusShared,
  invalidateRollbackStatus,
  __resetRollbackStatusCacheForTests,
} from '../rollbackStatusCache';

const AVAILABLE = { ok: true, available: true } as never;

beforeEach(() => {
  __resetRollbackStatusCacheForTests();
  vi.mocked(api.getStagingRollbackStatus).mockResolvedValue(AVAILABLE);
});

afterEach(() => vi.clearAllMocks());

describe('rollback status sharing', () => {
  it('serves concurrent askers from one request', async () => {
    // The card and the message undo affordance mount together and ask at the
    // same instant; that must cost one round trip, not two.
    const [a, b, c] = await Promise.all([
      getRollbackStatusShared('tok-1'),
      getRollbackStatusShared('tok-1'),
      getRollbackStatusShared('tok-1'),
    ]);

    expect(api.getStagingRollbackStatus).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('reuses the answer for a later asker', async () => {
    await getRollbackStatusShared('tok-1');
    await getRollbackStatusShared('tok-1');

    expect(api.getStagingRollbackStatus).toHaveBeenCalledTimes(1);
  });

  it('keeps tokens apart', async () => {
    await getRollbackStatusShared('tok-1');
    await getRollbackStatusShared('tok-2');

    expect(api.getStagingRollbackStatus).toHaveBeenCalledTimes(2);
  });

  it('forgets an answer once the change is resolved', async () => {
    // The one thing that flips eligibility. Serving a cached "still undoable"
    // after a rollback would offer an action that cannot work.
    await getRollbackStatusShared('tok-1');
    invalidateRollbackStatus('tok-1');
    await getRollbackStatusShared('tok-1');

    expect(api.getStagingRollbackStatus).toHaveBeenCalledTimes(2);
  });

  it('forgets on the staging-state-changed broadcast', async () => {
    // Both surfaces already dispatch this on bless / revoke / rollback, so the
    // cache does not need its own notification path — but it must listen.
    await getRollbackStatusShared('tok-1');
    window.dispatchEvent(
      new CustomEvent('integral:staging-state-changed', {
        detail: { token: 'tok-1', state: 'revoked' },
      }),
    );
    await getRollbackStatusShared('tok-1');

    expect(api.getStagingRollbackStatus).toHaveBeenCalledTimes(2);
  });

  it('does not strand callers when the request fails', async () => {
    // A rejected in-flight entry that is never cleared would wedge the token
    // forever, since every later asker awaits the same dead promise.
    vi.mocked(api.getStagingRollbackStatus).mockRejectedValueOnce(
      new Error('boom'),
    );
    await expect(getRollbackStatusShared('tok-1')).rejects.toThrow('boom');

    vi.mocked(api.getStagingRollbackStatus).mockResolvedValue(AVAILABLE);
    await expect(getRollbackStatusShared('tok-1')).resolves.toEqual(AVAILABLE);
    expect(api.getStagingRollbackStatus).toHaveBeenCalledTimes(2);
  });
});
