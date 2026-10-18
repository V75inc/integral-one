import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { workspacesApi } from '../api/workspaces';
import { isOwnedPersonalWorkspace, type Workspace } from '../api/workspaces';
import {
  Badge,
  Button,
  EmptyState,
  Skeleton,
  IconWell,
  LINE_ICON_STROKE,
  PageHeading,
  PageMeta,
  PageShell,
  PageSection,
  TrackDot,
} from '../components/ui';
import { CreateWorkspaceModal } from '../components/workspace/CreateWorkspaceModal';
import { LeaveWorkspaceButton } from '../components/workspace/LeaveWorkspaceButton';
import { useSetCrumbs } from '../context/CrumbsContext';
import { usePublishPageContext } from '../hooks/usePublishPageContext';

function RoleBadge({ role }: { role: string }) {
  const r = String(role || '').toLowerCase();
  const label = r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Member';
  // Owner renders as plain muted text — no chip background — so the
  // common case stays quiet. Other roles keep their chip variant.
  if (r === 'owner') {
    return <span className="text-xs text-[var(--text-muted)]">{label}</span>;
  }
  const variant =
    r === 'admin' ? 'info'
    : r === 'guest' ? 'warning'
    : 'default';
  return <Badge variant={variant}>{label}</Badge>;
}

function formatWorkspaceType(t?: string): string | null {
  if (!t) return null;
  const v = t.trim().toLowerCase();
  if (!v) return null;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

export function WorkspacesPage() {
  useSetCrumbs([{ label: 'Workspaces' }]);
  const [modal, setModal] = useState(false);

  const {
    data: workspaces = [],
    isLoading: loading,
    isError,
    dataUpdatedAt,
    error,
    refetch,
  } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => workspacesApi.list(),
  });

  usePublishPageContext({
    pageKind: 'workspaces_list',
    metadata: {
      workspace_count: workspaces.length,
      workspace_names: workspaces.map((w) => w.name).filter(Boolean).slice(0, 25),
    },
  });

  const errorMsg = isError
    ? String(
        (error as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || (error as Error)?.message || 'Failed to load'
      )
    : null;

  return (
    <PageShell>
      <PageSection>
        <header className="mb-8 md:mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <PageHeading>Workspaces</PageHeading>
            <PageMeta>
              <span>{dataUpdatedAt ? `${workspaces.length} ${workspaces.length === 1 ? 'workspace' : 'workspaces'}` : loading ? 'Loading workspaces…' : 'Workspaces unavailable'}</span>
              <span aria-hidden>·</span>
              <span>Your workspaces and shared spaces</span>
            </PageMeta>
          </div>
          <Button
            className="shrink-0 self-start sm:self-end w-full sm:w-auto"
            variant="primary"
            size="sm"
            icon={<Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
            onClick={() => setModal(true)}
          >
            New workspace
          </Button>
        </header>
      </PageSection>

      <PageSection.Separator />

      <PageSection className="mt-8">
        {errorMsg && (
          <div
            className="mb-6 rounded-[var(--radius-card)] border border-[color:var(--danger-fg)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-fg)]"
            role="alert"
          >
            {errorMsg}
            <button type="button" className="ml-3 underline font-medium" onClick={() => refetch()}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-1">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : isError && workspaces.length === 0 ? null : workspaces.length === 0 ? (
          <EmptyState
            icon={
              <IconWell size="lg" aria-hidden>
                <Building2 size={22} strokeWidth={LINE_ICON_STROKE} />
              </IconWell>
            }
            title="No workspaces yet"
            description="Create a workspace to invite collaborators and group your work."
            action={
              <Button
                variant="primary"
                icon={<Plus size={14} strokeWidth={LINE_ICON_STROKE} />}
                onClick={() => setModal(true)}
              >
                Create workspace
              </Button>
            }
          />
        ) : (
          <ul className="collection-list">
            {(workspaces as Workspace[]).map(w => {
              const isOwnedPersonal = isOwnedPersonalWorkspace(w);
              const isInvitedPersonal = w.kind === 'personal' && !isOwnedPersonal;
              const typeLabel = w.kind === 'personal' ? null : formatWorkspaceType(w.workspace_type);
              return (
                <li key={w.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 transition-colors duration-fast">
                    <Link
                      to={`/workspaces/${w.id}`}
                      className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] gap-x-[18px] py-4 px-4"
                    >
                    <TrackDot
                      color={w.accent_color}
                      size="md"
                      className="mt-[8px] shrink-0"
                      title={w.name}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-[15px] font-medium text-[var(--text)] truncate">
                          {w.name}
                        </p>
                        {w.your_role && !isInvitedPersonal ? <RoleBadge role={w.your_role} /> : null}
                        {isOwnedPersonal ? (
                          <Badge variant="default">Personal</Badge>
                        ) : isInvitedPersonal ? (
                          <Badge variant="info">Invited</Badge>
                        ) : typeLabel ? (
                          <Badge variant="default">{typeLabel}</Badge>
                        ) : null}
                      </div>
                      {isInvitedPersonal ? (
                        <p className="text-sm text-[var(--text-muted)] mt-0.5 line-clamp-1">
                          You were invited to this workspace
                        </p>
                      ) : w.description ? (
                        <p className="text-sm text-[var(--text-muted)] mt-0.5 line-clamp-1">
                          {w.description}
                        </p>
                      ) : (
                        <p className="text-sm text-[var(--text-subtle)] italic mt-0.5">
                          {isOwnedPersonal
                            ? 'Your private workspace'
                            : isInvitedPersonal
                              ? 'You were invited to this workspace'
                            : 'Manage members, spaces, and workspace-wide tracks'}
                        </p>
                      )}
                    </div>
                    <div aria-hidden className="text-[var(--text-subtle)] pt-0.5 self-start">
                      →
                    </div>
                    </Link>
                    <div className="pr-4">
                      <LeaveWorkspaceButton workspace={w} compact />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

      <CreateWorkspaceModal
        open={modal}
        onClose={() => setModal(false)}
      />
      </PageSection>
    </PageShell>
  );
}
