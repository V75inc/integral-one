import axios, { type AxiosInstance, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';

/**
 * Share one in-flight (or very recent) request between callers.
 *
 * The SPA mounts several components that each ask for the same listing
 * (`/tracks`, `/apps`) during one page load. Each call costs the server a full
 * permission walk, so identical concurrent calls are collapsed into one.
 * Entries expire after `ttlMs` and are dropped on any successful write
 * (see `clearAllSingleFlights`, called from the axios response interceptor),
 * so a create/delete is never hidden behind a cached listing.
 */
type Entry<T> = { promise: Promise<T>; expires: number };

const registry = new Set<Map<string, Entry<unknown>>>();
let readContextKey = () => '';

/** The canonical API client supplies the current credential/workspace context. */
export function configureSingleFlightContext(getKey: () => string): void {
  readContextKey = getKey;
  clearAllSingleFlights();
}

export function createSingleFlight<T>(ttlMs: number) {
  const store = new Map<string, Entry<T>>();
  let previousContext: string | undefined;
  registry.add(store as Map<string, Entry<unknown>>);
  return {
    run(key: string, fn: () => Promise<T>): Promise<T> {
      const context = readContextKey();
      if (context !== previousContext) {
        // Outer API flights must not bypass the adapter's auth/scope partition.
        // Read dynamically too: another tab can change the stored credentials.
        store.clear();
        previousContext = context;
      }
      const now = Date.now();
      const hit = store.get(key);
      if (hit && hit.expires > now) return hit.promise;
      const promise = fn().then(value => {
        const entry = store.get(key);
        if (entry?.promise === promise) entry.expires = Date.now() + ttlMs;
        return value;
      }, err => {
        if (store.get(key)?.promise === promise) store.delete(key);
        throw err;
      });
      // A slow request must not expire while callers are still waiting for it.
      // The freshness window starts on completion; invalidation still wins.
      store.set(key, { promise, expires: Number.POSITIVE_INFINITY });
      return promise;
    },
    clear() {
      store.clear();
    },
  };
}

export function clearAllSingleFlights(): void {
  registry.forEach(s => s.clear());
  clearSharedGets();
}

/**
 * Share one network call between identical GETs that are in flight at the same
 * moment (same URL, params, auth and workspace scope).
 *
 * A page load mounts many components that ask for the same resource; under React
 * StrictMode in dev every mount effect also runs twice. Each duplicate costs the
 * server a full permission walk. Only overlapping requests are shared: the entry is
 * dropped the moment the call settles, so nothing is ever served stale.
 * Requests with an abort signal, progress callbacks or a non-JSON response type are
 * left alone, and each caller gets its own copy of the response data.
 */
export type SharedGetOptions = {
  /** URLs (path + query, ``/api`` prefix removed) whose settled responses may be reused. */
  reusable?: (path: string) => boolean;
  /** How long a settled response of a reusable URL is reused. */
  reuseMs?: number;
};

type SharedEntry = { promise: Promise<AxiosResponse>; expires: number };
const sharedStores = new Set<Map<string, SharedEntry>>();

/** Drop every shared GET (called on writes and on live graph-change events). */
export function clearSharedGets(): void {
  sharedStores.forEach(store => store.clear());
}

export function dedupeConcurrentGets(client: AxiosInstance, options: SharedGetOptions = {}): void {
  const base = axios.getAdapter(client.defaults.adapter);
  const store = new Map<string, SharedEntry>();
  sharedStores.add(store);
  const reuseMs = options.reuseMs ?? 0;
  client.defaults.adapter = (config: InternalAxiosRequestConfig) => {
    const method = String(config.method || 'get').toLowerCase();
    if (
      method !== 'get' ||
      config.signal ||
      config.onDownloadProgress ||
      (config.responseType && config.responseType !== 'json')
    ) {
      return base(config);
    }
    const headers = config.headers as unknown as { get?: (n: string) => unknown } | undefined;
    const uri = axios.getUri(config);
    const key = JSON.stringify([
      uri,
      headers?.get?.('Authorization') ?? '',
      headers?.get?.('X-Integral-Scope') ?? '',
    ]);
    const now = Date.now();
    const shared = store.get(key);
    if (shared && shared.expires > now) {
      return shared.promise.then(response => ({
        ...response,
        config,
        data: cloneData(response.data),
      }));
    }
    const path = uri.replace(/^https?:\/\/[^/]+/, '').replace(/^\/api(?=\/)/, '');
    const keep = reuseMs > 0 && Boolean(options.reusable?.(path));
    const promise = base(config);
    // In flight: always shareable. After it settles it is kept only for reusable URLs.
    const entry: SharedEntry = { promise, expires: Number.POSITIVE_INFINITY };
    store.set(key, entry);
    promise.then(
      () => {
        if (store.get(key) !== entry) return;
        if (keep) entry.expires = Date.now() + reuseMs;
        else store.delete(key);
      },
      () => {
        if (store.get(key) === entry) store.delete(key);
      },
    );
    return promise;
  };
}

function cloneData<T>(data: T): T {
  if (data === null || typeof data !== 'object') return data;
  try {
    return structuredClone(data);
  } catch {
    return JSON.parse(JSON.stringify(data)) as T;
  }
}
