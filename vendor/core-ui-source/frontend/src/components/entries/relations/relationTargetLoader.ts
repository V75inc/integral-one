/**
 * DataLoader-style batcher for relation-target label resolution.
 *
 * `useRelationLabels` resolves each relation id through React Query (one cache
 * entry per id, so identical ids across cards share a result). Without batching,
 * each distinct id is a separate `GET /entries/{id}` — N requests on a table /
 * board view with relation columns. This loader collects every id requested
 * within a tick and resolves them in a single `POST /entry-lookup` round trip,
 * while React Query keeps the per-id caching.
 */
import apiClient from '../../../api/client';

export interface RawRelationTarget {
  id: string;
  title?: string;
  body?: string;
  track_id?: string;
  track_title?: string;
}

type Kind = 'entry' | 'track';
type Pending = (value: RawRelationTarget | undefined) => void;

const queues: Record<Kind, Map<string, Pending[]>> = {
  entry: new Map(),
  track: new Map(),
};
const scheduled: Record<Kind, boolean> = { entry: false, track: false };

async function flush(kind: Kind): Promise<void> {
  const queue = queues[kind];
  queues[kind] = new Map();
  scheduled[kind] = false;
  const ids = Array.from(queue.keys());
  if (ids.length === 0) return;

  const byId = new Map<string, RawRelationTarget>();
  try {
    const { data } = await apiClient.post('/entry-lookup', { ids, kind });
    for (const t of (data?.targets ?? []) as RawRelationTarget[]) {
      byId.set(t.id, t);
    }
  } catch {
    // Leave byId empty — each pending resolves to undefined and the hook falls
    // back to its id-suffix placeholder label (same as a failed per-id fetch).
  }
  for (const [id, pendings] of queue) {
    for (const resolve of pendings) resolve(byId.get(id));
  }
}

/** Queue an id for batched resolution; resolves to its raw target or undefined. */
export function loadRelationTarget(
  kind: Kind,
  id: string,
): Promise<RawRelationTarget | undefined> {
  return new Promise(resolve => {
    const queue = queues[kind];
    const existing = queue.get(id);
    if (existing) existing.push(resolve);
    else queue.set(id, [resolve]);
    if (!scheduled[kind]) {
      scheduled[kind] = true;
      // Macrotask: lets a full render's worth of card/field hooks enqueue first.
      setTimeout(() => flush(kind), 0);
    }
  });
}
