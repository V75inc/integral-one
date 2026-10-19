import { PRODUCT_NAME } from '../brand';

/**
 * Lightweight client telemetry hook. Replace with analytics provider in production.
 */

const KEY = 't75_telemetry';

export function initTelemetry(): void {
  if (typeof window === 'undefined') return;
  const w = window as Window & { __T75_TELEMETRY__?: { log: typeof logEvent } };
  w.__T75_TELEMETRY__ = { log: logEvent };
}

export function logEvent(
  name: string,
  payload?: Record<string, unknown>
): void {
  if (import.meta.env.DEV) {
    console.debug(`[${PRODUCT_NAME}:${KEY}]`, name, payload ?? {});
  }
  const endpoint = import.meta.env.VITE_TELEMETRY_ENDPOINT as string | undefined;
  if (endpoint && !import.meta.env.DEV) {
    const body = JSON.stringify({
      name,
      payload: payload ?? {},
      t: Date.now(),
    });
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      /* ignore */
    });
  }
  try {
    const q = JSON.parse(sessionStorage.getItem(KEY) || '[]') as unknown[];
    q.push({ t: Date.now(), name, payload });
    sessionStorage.setItem(KEY, JSON.stringify(q.slice(-100)));
  } catch {
    /* ignore */
  }
}
