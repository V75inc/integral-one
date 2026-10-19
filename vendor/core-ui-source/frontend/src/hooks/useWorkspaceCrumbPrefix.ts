/**
 * useWorkspaceCrumbPrefix — reusable breadcrumb prefix for workspace-scoped
 * resources.
 *
 * Returns ``[]`` when ``workspaceId`` is empty, so a caller can do
 * ``useSetCrumbs([...useWorkspaceCrumbPrefix(id), { label: name }])``
 * without conditional logic at the call site.
 *
 * The workspace name is fetched via React Query and cached under
 * ``['workspaces', 'detail', id]`` so navigating between a workspace's
 * apps and tracks doesn't re-hit the network.
 */

import { useQuery } from '@tanstack/react-query';
import { workspacesApi } from '../api';
import type { Crumb } from '../components/ui';

export function useWorkspaceCrumbPrefix(workspaceId?: string | null): Crumb[] {
  const id = (workspaceId || '').trim();
  const { data } = useQuery({
    queryKey: ['workspaces', 'detail', id],
    queryFn: () => workspacesApi.get(id),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
  if (!id) return [];
  const name = data?.name?.trim() || 'Workspace';
  // Single workspace crumb (linked to its detail page). The intermediate
  // "Workspaces" listing entry is intentionally omitted from
  // resource-detail trails — it adds depth without information when the
  // user can already see the workspace name as the parent.
  return [{ label: name, to: `/workspaces/${id}` }];
}
