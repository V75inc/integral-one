import { useMemo } from 'react';
import { useScope } from '../context/ScopeContext';
import type { Workspace } from '../api/workspaces';

export interface WorkspaceCreationRights {
  canCreateApps: boolean;
  canCreateTracks: boolean;
  /** True when scoped to an org workspace and the caller lacks app creation. */
  lacksAppCreationInOrg: boolean;
  /** True when scoped to an org workspace and the caller lacks track creation. */
  lacksTrackCreationInOrg: boolean;
}

function resolveCreationRights(workspace: Workspace | null): WorkspaceCreationRights {
  if (!workspace) {
    return {
      canCreateApps: false,
      canCreateTracks: false,
      lacksAppCreationInOrg: false,
      lacksTrackCreationInOrg: false,
    };
  }

  const role = workspace.your_role;
  const isOwner = role === 'owner';
  const isPersonal = workspace.kind === 'personal';

  // Mirror backend can_create_*_under_workspace: owner / personal always;
  // org admin does NOT auto-grant — only the IS_MEMBER_OF edge flags do.
  const canCreateApps =
    isPersonal || isOwner || Boolean(workspace.can_create_apps);
  const canCreateTracks =
    isPersonal || isOwner || Boolean(workspace.can_create_tracks);

  const isOrg = workspace.kind === 'organization';

  return {
    canCreateApps,
    canCreateTracks,
    lacksAppCreationInOrg: isOrg && !canCreateApps,
    lacksTrackCreationInOrg: isOrg && !canCreateTracks,
  };
}

/** Workspace-scoped creation gates for Apps and Tracks. */
export function useWorkspaceCreationRights(): WorkspaceCreationRights {
  const { activeWorkspace } = useScope();
  return useMemo(
    () => resolveCreationRights(activeWorkspace),
    [activeWorkspace],
  );
}

/** Pure helper for tests and non-hook consumers. */
export { resolveCreationRights };
