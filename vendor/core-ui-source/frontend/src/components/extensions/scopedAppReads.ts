import type {QueryClient} from '@tanstack/react-query';
import type {AppReadOptions, Json} from '@integral/sdk-react';

type Flight = {task: Promise<Json>; users: number; settled: boolean};
const flights = new WeakMap<QueryClient, Map<string, Flight>>();
const scopes = new WeakMap<QueryClient, string>();
export function canonicalReadInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalReadInput);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonicalReadInput(item)]));
  return value;
}
export function prepareReadScope(client: QueryClient, principal: string, workspace: string) {
  const owner = JSON.stringify([principal, workspace]);
  const previous = scopes.get(client);
  if (previous && previous !== owner) {
    void client.cancelQueries({queryKey: ['app-ui-data']});
    client.removeQueries({queryKey: ['app-ui-data']});
  }
  scopes.set(client, owner);
}
export function readScopedAppQuery(client: QueryClient, namespace: readonly unknown[], key: string, input: Json,
  dispatch: (input: Json, signal: AbortSignal) => Promise<Json>, signal?: AbortSignal, options: AppReadOptions = {}): Promise<Json> {
  if (signal?.aborted) return Promise.reject(new Error('This read was cancelled.'));
  const payload = canonicalReadInput(JSON.parse(JSON.stringify(input))) as Json;
  const queryKey = ['app-ui-data', ...namespace, key, payload];
  const identity = JSON.stringify(queryKey);
  let active = flights.get(client);
  if (!active) {active = new Map(); flights.set(client, active);}
  let flight = active.get(identity);
  if (!flight) {
    flight = {task: client.fetchQuery<Json>({queryKey, staleTime: Math.min(300_000, Math.max(0, options.staleTime ?? 30_000)), gcTime: 300_000, retry: false,
      queryFn: ({signal}) => dispatch(payload, signal)}), users: 0, settled: false};
    active.set(identity, flight);
    const current = flight;
    const settled = () => {current.settled = true; if (active!.get(identity) === current) active!.delete(identity);};
    void flight.task.then(settled, settled);
  }
  const current = flight;
  current.users++;
  return new Promise((resolve, reject) => {
    let finished = false;
    const release = () => {
      if (finished) return false;
      finished = true; signal?.removeEventListener('abort', abort); current.users--;
      return true;
    };
    const abort = () => {
      if (!release()) return;
      reject(new Error('This read was cancelled.'));
      if (!current.settled && current.users === 0 && active!.get(identity) === current) {
        active!.delete(identity);
        void client.cancelQueries({queryKey, exact: true});
      }
    };
    signal?.addEventListener('abort', abort, {once: true});
    current.task.then(value => {if (release()) resolve(value);}, error => {if (release()) reject(error);});
    if (signal?.aborted) abort();
  });
}
