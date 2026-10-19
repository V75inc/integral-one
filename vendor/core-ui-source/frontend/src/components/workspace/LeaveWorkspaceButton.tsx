import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { workspacesApi, type Workspace } from '../../api/workspaces';
import { invalidateWorkspaceListCaches } from '../../queryKeys';
import { useAuth } from '../../context/AuthContext';
import { useConfirm } from '../../context/ConfirmContext';
import { useScope } from '../../context/ScopeContext';
import { useToast } from '../../context/ToastContext';
import { isSamePrincipal } from '../../utils';
import { Button, LINE_ICON_STROKE } from '../ui';

interface Props {
  workspace: Workspace;
  redirectTo?: string;
  compact?: boolean;
}

export function LeaveWorkspaceButton({
  workspace,
  redirectTo,
  compact = false,
}: Props) {
  const { user } = useAuth();
  const { scope, setScope } = useScope();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  const isOwner = Boolean(
    user &&
    (isSamePrincipal(user, workspace.owner_user_id) ||
      workspace.your_role === 'owner'),
  );
  if (isOwner) return null;

  const leave = async () => {
    const confirmed = await confirm({
      title: 'Remove workspace?',
      message: `This removes ${workspace.name} from your workspace list and ends your access. The workspace and its contents will remain available to its owner and other members.`,
      confirmLabel: 'Remove workspace',
      variant: 'danger',
    });
    if (!confirmed) return;

    setLeaving(true);
    try {
      await workspacesApi.leave(workspace.id);
      const remaining = (
        queryClient.getQueryData<Workspace[]>(['workspaces']) ?? []
      ).filter(item => item.id !== workspace.id);
      queryClient.setQueryData(['workspaces'], remaining);
      await Promise.all([
        invalidateWorkspaceListCaches(queryClient),
        queryClient.invalidateQueries({ queryKey: ['me', 'scope'] }),
      ]);
      if (scope?.workspaceId === workspace.id) {
        const fresh =
          queryClient.getQueryData<Workspace[]>(['workspaces']) ?? remaining;
        const fallback = fresh.find(item => item.kind === 'personal') ?? fresh[0];
        if (fallback) setScope({ workspaceId: fallback.id });
      }
      showToast('Workspace removed from your list', 'success');
      if (redirectTo) navigate(redirectTo);
    } catch (error: unknown) {
      const response = (
        error as { response?: { data?: { detail?: string; message?: string } } }
      )?.response?.data;
      showToast(
        String(response?.detail || response?.message || 'Failed to remove workspace'),
        'error',
      );
    } finally {
      setLeaving(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      icon={<LogOut size={14} strokeWidth={LINE_ICON_STROKE} />}
      onClick={leave}
      disabled={leaving}
      title="Remove this workspace from your list and end your access"
    >
      {leaving ? 'Removing…' : compact ? 'Remove' : 'Remove workspace'}
    </Button>
  );
}
