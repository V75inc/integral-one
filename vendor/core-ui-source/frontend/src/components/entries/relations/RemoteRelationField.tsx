import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import apiClient from '../../../api/client';
import { unwrapApiDataEnvelope } from '../../../api/helpers';
import { useAuthOptional } from '../../../context/AuthContext';
import { useScopeOptional } from '../../../context/ScopeContext';
import { Text } from '../../../ui';
import { Button } from '../../ui/Button';
import type { SeamlessFieldProps } from '../SeamlessField';
import { beginInteraction, finishInteraction } from '../../../lib/performance';

export interface RelationSource {
  trackId: string;
  entryTypeId: string;
  entryId?: string;
  schema?: unknown;
  enabled?: boolean;
  onChoices?: (choices: { value: string; label: string }[]) => void;
}
interface Page {
  options: { id: string; label: string; track_id: string; track_title: string }[];
  next_cursor: string | null;
  has_more: boolean;
}

// One listener per QueryClient prevents a table of mounted fields from
// cancelling/restarting the same read once per cell after a mutation.
const invalidationSubscriptions = new WeakMap<QueryClient, { users: number; changed: () => void }>();
function subscribeInvalidation(client: QueryClient): () => void {
  let entry = invalidationSubscriptions.get(client);
  if (!entry) {
    let scheduled = false;
    const changed = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        if (invalidationSubscriptions.get(client)?.changed !== changed) return;
        // Even an initial pending read may predate this mutation. Cancel it
        // before refreshing so its stale result cannot erase invalidation.
        void client.cancelQueries({ queryKey: ['relation-options'] }).then(() =>
          client.invalidateQueries({ queryKey: ['relation-options'] }));
        void client.invalidateQueries({ queryKey: ['related-record-operations'] });
      });
    };
    entry = { users: 0, changed };
    invalidationSubscriptions.set(client, entry);
    window.addEventListener('integral:records-changed', changed);
    window.addEventListener('integral:change-event-applied', changed);
  }
  const subscription = entry;
  subscription.users++;
  return () => {
    if (--subscription.users !== 0) return;
    window.removeEventListener('integral:records-changed', subscription.changed);
    window.removeEventListener('integral:change-event-applied', subscription.changed);
    invalidationSubscriptions.delete(client);
  };
}

/** Each picker owns its lifecycle. React Query shares identical active reads. */
export function RemoteRelationField({ props, render }: {
  props: SeamlessFieldProps;
  render: (props: SeamlessFieldProps) => ReactNode;
}) {
  const source = props.relationSource!;
  const auth = useAuthOptional();
  const workspace = useScopeOptional()?.scope?.workspaceId;
  const principal = auth?.user?.id;
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [ready, setReady] = useState(false);
  const interaction = useRef<ReturnType<typeof beginInteraction>>();
  const choicesCallback = useRef(source.onChoices);
  choicesCallback.current = source.onChoices;
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => { setQuery(search); setReady(true); }, 250);
    return () => clearTimeout(timer);
  }, [open, search]);
  const key = ['relation-options', principal, workspace, source.trackId,
    source.entryTypeId, JSON.stringify(source.schema ?? props.field), props.field.key, source.entryId, search];
  const result = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    enabled: open && ready && query === search && source.enabled !== false && Boolean(principal && workspace && source.trackId && source.entryTypeId),
    queryFn: async ({ pageParam, signal }): Promise<Page> => {
      const { data } = await apiClient.get('/relation-options', {
        signal,
        headers: interaction.current ? { traceparent: interaction.current.traceparent } : undefined,
        params: { track_id: source.trackId, entry_type_id: source.entryTypeId,
          field_key: props.field.key, entry_id: source.entryId || undefined,
          q: search, cursor: pageParam || undefined, limit: 50 },
      });
      return unwrapApiDataEnvelope(data) as unknown as Page;
    },
    getNextPageParam: page => page.has_more ? page.next_cursor : undefined,
    // Share even a just-completed read when sibling debounce timers settle
    // a few milliseconds apart. ChangeEvents/mutations still invalidate it.
    staleTime: 1000,
    gcTime: 30_000,
    retry: false,
    maxPages: 20,
  });
  const choices = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    for (const page of result.data?.pages ?? []) for (const option of page.options) {
      options.set(option.id, { value: option.id,
        label: option.track_title ? `${option.label} (${option.track_title})` : option.label });
    }
    return Array.from(options.values());
  }, [result.data]);
  useEffect(() => { choicesCallback.current?.(choices); }, [choices]);
  useEffect(() => subscribeInvalidation(client), [client]);
  useEffect(() => {
    if (open && ready && search === query && !result.isFetching && result.data) {
      finishInteraction(interaction.current, 'relation.options', choices.length);
      interaction.current = undefined;
    }
  }, [open, ready, search, query, result.isFetching, result.data, choices.length]);
  return <>
    {render({ ...props, relationSource: undefined, relationChoices: choices,
      relationFooter: <>
    {open && result.isError && <div role="alert"><Text variant="body-sm" tone="muted">Could not load choices.</Text>
      <Button type="button" variant="secondary" onClick={() => void result.refetch()}>Retry</Button></div>}
    {open && result.hasNextPage && <Button type="button" variant="secondary" disabled={result.isFetching}
      onClick={() => void result.fetchNextPage()}>Load more</Button>}
      </>,
      relationLoading: result.isFetching || (open && (!ready || search !== query)), searchable: true,
      onRelationOpen: next => {
        if (next === open) return;
        setOpen(next);
        setReady(false);
        if (next) { setSearch(''); interaction.current = beginInteraction(); }
      },
      onRelationSearch: value => {
        if (value !== search) { setReady(false); setSearch(value); }
        interaction.current = beginInteraction();
      },
    })}

  </>;
}
