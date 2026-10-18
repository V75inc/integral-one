import {
  getStagingRollbackStatus,
  type RollbackStatusResponse,
} from '../../../api/agentive';

/**
 * One answer per token, shared by everyone who asks.
 *
 * Undo eligibility is asked about the same token from two places at once — the
 * approval card (`useStagedChange`) and the message-level undo affordance
 * (`MessageUndoActions`) — and both are right to ask. Each asking separately
 * meant a transcript issued `rollback-status` twice per consumed card per
 * mount, which made it the noisiest call in the app.
 *
 * So dedupe rather than delete a caller: concurrent asks share one in-flight
 * request, and the answer is reused briefly afterwards. Eligibility changes
 * only when the change is rolled back or otherwise resolved, and both of those
 * invalidate here — so the window trades no correctness for a large reduction
 * in traffic.
 */

const TTL_MS = 15_000;

const inFlight = new Map<string, Promise<RollbackStatusResponse>>();
const cached = new Map<string, { at: number; value: RollbackStatusResponse }>();

export function getRollbackStatusShared(
  token: string,
): Promise<RollbackStatusResponse> {
  const hit = cached.get(token);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return Promise.resolve(hit.value);
  }

  const pending = inFlight.get(token);
  if (pending) return pending;

  const req = getStagingRollbackStatus(token)
    .then((value) => {
      cached.set(token, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inFlight.delete(token);
    });

  inFlight.set(token, req);
  return req;
}

/** Drop a cached answer — call after anything that changes eligibility. */
export function invalidateRollbackStatus(token?: string): void {
  if (token) {
    cached.delete(token);
    return;
  }
  cached.clear();
}

// A resolved or rolled-back change is exactly when eligibility flips, so the
// cache must not outlive it. Both surfaces already broadcast this.
if (typeof window !== 'undefined') {
  window.addEventListener('integral:staging-state-changed', (event) => {
    const token = (event as CustomEvent<{ token?: string }>).detail?.token;
    invalidateRollbackStatus(token);
  });
}

/** Test seam — the maps are module state and would leak between cases. */
export function __resetRollbackStatusCacheForTests(): void {
  inFlight.clear();
  cached.clear();
}
