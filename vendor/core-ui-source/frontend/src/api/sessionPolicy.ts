import axios from 'axios';
import { getApiBaseURL } from '../config';
import { configureSessionRuntime } from './sessionRuntime';

/** Public runtime policy; token validity is always decided by the API. */
export interface SessionPolicy {
  idle_timeout_seconds: number;
  silent_refresh_activity_seconds: number;
  refresh_lead_seconds: number;
  min_refresh_interval_seconds: number;
  renewal_request_timeout_seconds: number;
  access_token_ttl_seconds: number;
  refresh_token_ttl_seconds: number;
}

const DEFAULT_POLICY: SessionPolicy = {
  idle_timeout_seconds: 0,
  silent_refresh_activity_seconds: 900,
  refresh_lead_seconds: 120,
  min_refresh_interval_seconds: 30,
  renewal_request_timeout_seconds: 20,
  access_token_ttl_seconds: 3600,
  refresh_token_ttl_seconds: 604800,
};
let policy = { ...DEFAULT_POLICY };
let pending: Promise<void> | undefined;

export const getSessionPolicy = (): Readonly<SessionPolicy> => policy;

/** Keep compatible defaults when talking to an older server or while offline. */
export function applySessionPolicy(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  const source = value as Record<string, unknown>;
  const bounds: Record<keyof SessionPolicy, [number, number]> = {
    idle_timeout_seconds: [0, 604800],
    silent_refresh_activity_seconds: [0, 604800],
    refresh_lead_seconds: [0, 3600],
    min_refresh_interval_seconds: [1, 3600],
    renewal_request_timeout_seconds: [1, 300],
    access_token_ttl_seconds: [1, Number.MAX_SAFE_INTEGER / 1000],
    refresh_token_ttl_seconds: [1, Number.MAX_SAFE_INTEGER / 1000],
  };
  const next = { ...DEFAULT_POLICY };
  for (const key of Object.keys(bounds) as (keyof SessionPolicy)[]) {
    const candidate = source[key];
    const [min, max] = bounds[key];
    if (typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= min && candidate <= max) {
      next[key] = candidate;
    }
  }
  policy = next;
}

export function loadSessionPolicy(): Promise<void> {
  // Bare public request: loading policy must not depend on a valid session or
  // enter the authenticated client's refresh/recovery interceptors.
  pending ??= Promise.resolve()
    .then(() => axios.get(`${getApiBaseURL()}/meta/deployment`, { timeout: 5000 }))
    .then(response => {
      configureSessionRuntime(response.data);
      applySessionPolicy(response.data?.session_policy);
    })
    .catch(() => { /* Defaults keep login and offline recovery available. */ });
  return pending;
}
