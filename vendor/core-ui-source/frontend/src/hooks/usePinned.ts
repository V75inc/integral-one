/**
 * usePinned — React Query wrapper around the per-user pinned-IDs cache.
 *
 * Returns the current set + helpers to toggle pins. Optimistic update
 * keeps the UI snappy; failure rolls back. Keyed off the caller's User
 * id when available so cache doesn't bleed across accounts.
 */

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pinnedApi, type PinnedSet } from '../api/pinned';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const EMPTY: PinnedSet = { tracks: [], apps: [] };

export function usePinned() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const key = ['pinned', user?.id ?? 'anon'];

  const query = useQuery<PinnedSet>({
    queryKey: key,
    queryFn: () => pinnedApi.get(),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (vars: { kind: 'track' | 'app'; id: string; pinned: boolean }) =>
      pinnedApi.toggle(vars.kind, vars.id, vars.pinned),
    onMutate: async vars => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<PinnedSet>(key) || EMPTY;
      const bucket = vars.kind === 'track' ? 'tracks' : 'apps';
      const items = prev[bucket];
      const has = items.includes(vars.id);
      const next: PinnedSet = {
        ...prev,
        [bucket]: vars.pinned
          ? has
            ? items
            : [...items, vars.id]
          : items.filter(x => x !== vars.id),
      };
      qc.setQueryData<PinnedSet>(key, next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData<PinnedSet>(key, ctx.prev);
      showToast('Could not update pin', 'error');
    },
    onSuccess: server => {
      qc.setQueryData<PinnedSet>(key, server);
    },
  });

  const pinned: PinnedSet = query.data ?? EMPTY;

  const isPinned = useCallback(
    (kind: 'track' | 'app', id: string) =>
      kind === 'track' ? pinned.tracks.includes(id) : pinned.apps.includes(id),
    [pinned]
  );

  const toggle = useCallback(
    (kind: 'track' | 'app', id: string) => {
      const currentlyPinned = isPinned(kind, id);
      mutation.mutate({ kind, id, pinned: !currentlyPinned });
    },
    [isPinned, mutation]
  );

  return {
    pinned,
    isPinned,
    toggle,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
