import { useQuery } from '@tanstack/react-query';
import { lookupWorkspaceMemberById } from '../../../api/members';
import { useScope } from '../../../context/ScopeContext';

export interface UseMemberLabelResult {
  label: string | null;
  displayName: string | null;
  email: string | null;
  avatarAttachmentId: string | undefined;
  loading: boolean;
}

const FIVE_MIN_MS = 5 * 60 * 1000;

/** Resolve a workspace member user id to display metadata for read-only surfaces. */
export function useMemberLabel(
  userId: string | null | undefined,
): UseMemberLabelResult {
  const { scope } = useScope();
  const workspaceId = scope?.workspaceId ?? '';
  const id = typeof userId === 'string' && userId.trim() ? userId.trim() : '';

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['member-label', workspaceId, id] as const,
    queryFn: async () => {
      if (!id || !workspaceId) return null;
      return lookupWorkspaceMemberById(id, workspaceId);
    },
    enabled: Boolean(id && workspaceId),
    staleTime: FIVE_MIN_MS,
  });

  const loading = Boolean(
    id && workspaceId && (isLoading || isFetching) && !data,
  );
  const displayName = data?.display_name?.trim() || null;
  const email = data?.email?.trim() || null;
  const label =
    displayName || email || (id ? `Member ${id.slice(-6)}` : null);

  return {
    label,
    displayName,
    email,
    avatarAttachmentId: data?.avatar_attachment_id,
    loading,
  };
}
