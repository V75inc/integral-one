/**
 * Phase 9 Plan 09-02 (NOTIF-01) — canonical notifications hook.
 *
 * Single source of unreadCount across NotificationsPage, NotificationsHeaderButton,
 * and MissionControlPage. Wraps a React Query query keyed by
 * NOTIFICATIONS_QUERY_KEY so concurrent consumers share one fetch and one cache.
 *
 * Mutation surface:
 *  - markRead(id):    invalidates the query → unreadCount recomputes on refetch.
 *  - markAllRead():   optimistically flips read=true on every cached row, then
 *                     invalidates on settle.
 *
 * The existing useNotificationsQuery() hook is preserved as a back-compat
 * shim re-exporting useNotifications under its prior name (see
 * useNotificationsQuery.ts). Surfaces are migrated to useNotifications()
 * directly within this plan.
 */
import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '../api/notifications';
import type { Notification } from '../types';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

function formatNotifyError(err: unknown): string | null {
  if (!err) return null;
  const d = (err as { response?: { data?: { detail?: string } } })?.response
    ?.data?.detail;
  if (d) return String(d);
  if (err instanceof Error) return err.message;
  return 'Failed to load notifications';
}

export interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  loading: boolean;
  refetch: () => Promise<unknown>;
  markRead: (id: string) => Promise<unknown>;
  markAllRead: () => Promise<unknown>;
  isMarkingRead: boolean;
  isMarkingAllRead: boolean;
}

export function useNotifications(): UseNotificationsResult {
  const qc = useQueryClient();

  const q = useQuery<{ notifications: Notification[]; unreadCount: number }>({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: async () => {
      const payload = await notificationsApi.list({ per_page: 100, page: 1 });
      return {
        notifications: payload.notifications as Notification[],
        unreadCount: payload.unread_count,
      };
    },
    // I-PERF: bumped from 15s to 60s. Background poll cadence was too tight
    // for a polling fallback (SSE/WebSocket push is a separate milestone);
    // 60s matches the cadence of the badge UI's perceived freshness.
    staleTime: 60_000,
  });

  const notifications = q.data?.notifications ?? [];
  const unreadCount =
    q.data?.unreadCount ?? notifications.filter(n => !n.read).length;

  const markReadMut = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: (_data, id) => {
      // Optimistic cache patch — unreadCount decrements within one render cycle.
      qc.setQueryData<{ notifications: Notification[]; unreadCount: number }>(
        NOTIFICATIONS_QUERY_KEY,
        prev => {
          if (!prev) return prev;
          const nextNotifications = prev.notifications.map(n =>
            n.id === id ? { ...n, read: true } : n,
          );
          return {
            notifications: nextNotifications,
            unreadCount: Math.max(0, prev.unreadCount - 1),
          };
        },
      );
      // Then revalidate from the server so cache stays in sync with the
      // authoritative state (and the new ChangeEvent has landed).
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });

  const markAllReadMut = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      const prev = qc.getQueryData<{
        notifications: Notification[];
        unreadCount: number;
      }>(NOTIFICATIONS_QUERY_KEY);
      if (prev) {
        qc.setQueryData<{ notifications: Notification[]; unreadCount: number }>(
          NOTIFICATIONS_QUERY_KEY,
          {
            notifications: prev.notifications.map(n => ({ ...n, read: true })),
            unreadCount: 0,
          },
        );
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
      }
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY }),
  });

  // IMPORTANT: ``refetch`` / ``markRead`` / ``markAllRead`` MUST have
  // stable identities — consumers (e.g. NotificationsHeaderButton's
  // ``useEffect([open, refetch, ...])``) put them in dep arrays. An
  // unstable arrow on every render would re-fire those effects every
  // render, producing an endless refetch loop the moment the modal
  // opens. ``useCallback`` over the (stable) mutate-async + refetch
  // returned by react-query gives every consumer a fixed reference.
  // Depending on `q` / the mutation OBJECT rather than `.refetch` /
  // `.mutateAsync` would make these unstable. The rule reports on the
  // dependency-array line, so disable sits immediately above that array.
  const refetch = useCallback(
    () => q.refetch(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- q.refetch only
    [q.refetch],
  );
  const markRead = useCallback(
    (id: string) => markReadMut.mutateAsync(id),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutateAsync only
    [markReadMut.mutateAsync],
  );
  const markAllRead = useCallback(
    () => markAllReadMut.mutateAsync(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutateAsync only
    [markAllReadMut.mutateAsync],
  );

  return {
    notifications,
    unreadCount,
    isLoading: q.isLoading,
    loading: q.isLoading,
    error: q.isError ? formatNotifyError(q.error) : null,
    refetch,
    markRead,
    markAllRead,
    isMarkingRead: markReadMut.isPending,
    isMarkingAllRead: markAllReadMut.isPending,
  };
}
