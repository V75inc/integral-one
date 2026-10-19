import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '../../../api/workspaces';
import { useScope } from '../../../context/ScopeContext';

const FIVE_MIN_MS = 5 * 60 * 1000;

export type MemberLabelResolver = (userId: string | null | undefined) => string | undefined;

/** Batch-resolve workspace member ids to display labels (kanban columns, chips). */
export function useWorkspaceMemberLabelMap(): {
  resolveMemberLabel: MemberLabelResolver;
  loading: boolean;
} {
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? '';

  const { data: members, isLoading, isFetching } = useQuery({
    queryKey: ['workspace-members', workspaceId] as const,
    queryFn: async () => {
      if (!workspaceId) return [];
      return workspacesApi.listMembers(workspaceId);
    },
    enabled: Boolean(workspaceId),
    staleTime: FIVE_MIN_MS,
  });

  const labelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members ?? []) {
      const ids = [member.id, member.user_id].filter(
        (id): id is string => typeof id === 'string' && Boolean(id.trim())
      );
      const label =
        member.display_name?.trim() ||
        member.email?.trim() ||
        (ids[0] ? `Member ${ids[0].slice(-6)}` : '');
      if (!label) continue;
      for (const id of ids) {
        map.set(id, label);
      }
    }
    return map;
  }, [members]);

  const resolveMemberLabel = useCallback<MemberLabelResolver>(
    userId => {
      const id = typeof userId === 'string' ? userId.trim() : '';
      if (!id) return undefined;
      // Unknown ids return undefined so callers can keep a user-renamed
      // column label (``?? c.label``) instead of always forcing ``Member xxx``.
      return labelById.get(id);
    },
    [labelById]
  );

  const loading = Boolean(workspaceId && (isLoading || isFetching) && !members);

  return { resolveMemberLabel, loading };
}
