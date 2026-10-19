import { useDeployment } from '../hooks/useDeployment';
import { useCallback, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { missionControlApi } from '../api';
import { isOwnedPersonalWorkspace } from '../api/workspaces';
import { formatRelativeTime, resolveIdentityColor } from '../utils';
import { useNotifications } from '../hooks/useNotifications';
import { useAuthOptional } from '../context/AuthContext';
import { useSetCrumbs } from '../context/CrumbsContext';
import { workspaceIdOf, useScope } from '../context/ScopeContext';
import { missionControlSnapshotQueryKey } from '../queryKeys';
import { AppIcon, Surface, Text } from '../ui';
import { Button, LogoMark, PageHeading, PageMeta, PageShell, PageSection, Skeleton } from '../components/ui';
import { PendingInvitationsPanel } from '../components/invitations/PendingInvitationsPanel';
import { MissionControlApprovals } from '../components/approvals/MissionControlApprovals';
import { usePublishPageContext } from '../hooks/usePublishPageContext';
import { notifyApiFailure } from '../components/system';
import { HomeChatComposer } from '../features/ai-chat/components/HomeChatComposer';
import { requestOpenCompanionChat } from '../features/ai-chat/chatHandoff';

/** Home previews readable work across workspaces; AI actions use the active scope. */
export function MissionControlPage() {
  const { singleUser } = useDeployment();
  useSetCrumbs([]);
  const auth = useAuthOptional();
  const { workspaces, scope } = useScope();
  const { unreadCount, loading: notificationsLoading, error: notificationsError } = useNotifications();
  const snapshot = useQuery({
    queryKey: missionControlSnapshotQueryKey(scope?.workspaceId),
    queryFn: () => missionControlApi.getSnapshot(50),
  });
  const apps = snapshot.data?.apps ?? [];
  const tracks = snapshot.data?.tracks ?? [];
  const previewEntries = snapshot.data?.preview_entries ?? [];
  const recentApps = useMemo(() => [...apps].sort((a, b) =>
    new Date(b.updated_at || b.created_at || 0).getTime() -
    new Date(a.updated_at || a.created_at || 0).getTime()).slice(0, 4), [apps]);
  const workspaceLabel = (id?: string | null) => {
    const ws = workspaces.find(item => item.id === id);
    return ws?.name?.trim() || (ws && isOwnedPersonalWorkspace(ws) ? 'Personal' : 'Workspace');
  };
  const activeWorkspace = workspaces.find(ws => ws.id === scope?.workspaceId);
  const actionLabel = workspaceLabel(activeWorkspace?.id);
  const retry = useCallback(() => { void snapshot.refetch(); }, [snapshot.refetch]);
  useEffect(() => {
    if (snapshot.error) notifyApiFailure(snapshot.error, { context: 'loading Home', onRetry: retry });
  }, [snapshot.error, retry]);
  usePublishPageContext({
    pageKind: 'mission_control',
    visibleData: {
      tracks: tracks.slice(0, 5).map(tr => ({ id: tr.id, title: tr.title || undefined })),
      entries: previewEntries.slice(0, 5).map(e => ({ id: e.id, title: e.title || undefined,
        status: e.status || undefined, entry_type: e.type || undefined })),
      total_count: Math.max(tracks.length, previewEntries.length),
    },
    metadata: { workspace_count: workspaces.length, app_count: apps.length,
      track_count: tracks.length, entry_preview_count: previewEntries.length,
      unread_notifications: unreadCount },
  });
  return <PageShell className="home-overview">
    <PageSection>
        <header className="mb-8 md:mb-10">
          <PageHeading>Home</PageHeading>
          <PageMeta>
            <span>
              {workspaces.length} workspace{workspaces.length === 1 ? '' : 's'}
            </span>
            <span aria-hidden className="hidden sm:inline">·</span>
            <span>
              {notificationsLoading || notificationsError ? '—' : unreadCount} unread {unreadCount === 1 ? 'notification' : 'notifications'}
            </span>
            {previewEntries[0]?.created_at ? (
              <>
                <span aria-hidden className="hidden sm:inline">·</span>
                {/* B-MC-01: the stat aggregates across every workspace the
                    user can read (matches Mission Control's bird's-eye
                    framing below), so the label spells that out instead
                    of looking like an active-scope number. */}
                <span className="basis-full sm:basis-auto">
                  Last activity across workspaces{' '}
                  {formatRelativeTime(previewEntries[0].created_at)}
                </span>
              </>
            ) : null}
          </PageMeta>
          <PageMeta as="p">
            {singleUser ? 'Your Apps and data are on this computer. Install an App, build your own, or start without AI.' : 'Your workspaces and recent activity in one place. Choose a workspace to get started.'}
          </PageMeta>
        </header>
    </PageSection>
    <PageSection.Separator />
    <PageSection className="mt-8">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(280px,1fr)]">
        {singleUser ? <Surface as="section" border="subtle" padding="lg" className="home-widget min-w-0">
          <Text as="h2" variant="heading-sm" weight="semibold">Start with an App</Text>
          <Text as="p" variant="body-sm" tone="muted" className="mt-3">Choose an App from your local library or build one for the way you work. AI setup is optional.</Text>
          <HomeLink to="/apps">Browse and install Apps</HomeLink>
          <HomeLink to="/settings#ai-models">Set up a local model or bring an API key</HomeLink>
          <Text as="p" variant="meta" tone="subtle" className="mt-3">Background tasks run while Integral is open.</Text>
        </Surface> : <Surface as="section" aria-labelledby="home-ai-heading" border="subtle" padding="lg" className="home-widget home-widget--ai min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <Text as="h2" id="home-ai-heading" variant="heading-sm" weight="semibold" className="flex items-center gap-2">
              <LogoMark size="sm" /> Integral AI
            </Text>
            <span aria-label="Agent workspace" className="max-w-48 truncate"><Text variant="meta" tone="muted">{activeWorkspace ? actionLabel : 'Choose a workspace'}</Text></span>
          </div>
          <HomeChatComposer workspaceId={activeWorkspace?.id ?? null} principalId={auth?.user?.id ?? null} />
        </Surface>}
        <Surface as="section" aria-labelledby="home-attention-heading" tone="panel-2" border="subtle" padding="lg" className="home-widget home-widget--attention min-w-0">
          <Text as="h2" id="home-attention-heading" variant="heading-sm" weight="semibold" className="mb-4">Needs your attention</Text>
          <MissionControlApprovals />
          <HomeLink to="/notifications">{notificationsLoading ? 'Checking notifications…' : notificationsError ? 'Notifications unavailable — open inbox' : `${unreadCount} unread ${unreadCount === 1 ? 'notification' : 'notifications'}`}</HomeLink>
          <HomeLink to="/background-tasks">Background tasks in {actionLabel}</HomeLink>
          {!singleUser && <PendingInvitationsPanel compact />}
        </Surface>
      </div>
      {snapshot.isError && <div role="status" className="my-4 flex flex-wrap items-center gap-3">
        <Text tone="muted" variant="body-sm">Could not refresh recent work. {snapshot.data ? 'Showing the last available snapshot.' : 'Try again to load your Apps and activity.'}</Text>
        <Button variant="outline" onClick={retry} loading={snapshot.isFetching}>Retry recent work</Button>
      </div>}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Surface as="section" aria-labelledby="mc-apps" border="subtle" padding="lg" className="home-widget home-widget--work min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Text as="h2" id="mc-apps" variant="heading-sm" weight="semibold">Continue working</Text>
            <HomeLink to="/apps">Apps in {actionLabel}</HomeLink>
          </div>
          {snapshot.isPending ? <HomeSkeleton /> : recentApps.length ? <ul>
            {recentApps.map(app => <li key={app.id}>
              <Link to={`/apps/${app.id}`} className="flex min-h-20 items-start gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                <AppIcon name={app.name} icon={app.icon} color={resolveIdentityColor(app.accent_color)} />
                <div className="min-w-0 flex-1">
                  <Text as="p" variant="body" weight="semibold" className="truncate">{app.name}</Text>
                  {app.description && <Text as="p" variant="body-sm" tone="muted" className="line-clamp-1">{app.description}</Text>}
                  <Text as="p" variant="meta" tone="subtle" className="mt-1">{workspaceLabel(workspaceIdOf(app))}{(app.updated_at || app.created_at) ? ` · Updated ${formatRelativeTime(app.updated_at || app.created_at!)}` : ''}</Text>
                </div><ArrowUpRight size={16} aria-hidden />
              </Link>
            </li>)}
          </ul> : !snapshot.isError && <div>
            <Text as="p" variant="body-sm" tone="muted">Your recent Apps will appear here. Describe what you want to manage to get started.</Text>
            <Button variant="outline" className="mt-4 min-h-11" disabled={!activeWorkspace}
              onClick={() => requestOpenCompanionChat({ draftText: 'Help me design an App for this workspace.' })}>Design an App with Integral</Button>
          </div>}
        </Surface>
        <Surface as="section" aria-labelledby="mc-activity" border="subtle" padding="lg" className="home-widget home-widget--activity min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Text as="h2" id="mc-activity" variant="heading-sm" weight="semibold">Recent activity</Text>
            <HomeLink to="/feed">Feed in {actionLabel}</HomeLink>
          </div>
          {snapshot.isPending ? <HomeSkeleton /> : previewEntries.length ? <ul>
            {previewEntries.slice(0, 4).map(entry => <li key={entry.id}>
              <Link to={entry.track_id ? `/tracks/${entry.track_id}?entry=${encodeURIComponent(entry.id)}` : `/entries/${entry.id}`}
                className="flex min-h-20 items-start gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
                <ArrowUpRight size={16} aria-hidden className="mt-1 shrink-0" />
                <div className="min-w-0 flex-1">
                  <Text as="p" variant="body" weight="semibold" className="truncate">{entry.title || 'Untitled entry'}</Text>
                  <Text as="p" variant="meta" tone="muted" className="mt-1">{workspaceLabel(workspaceIdOf(tracks.find(track => track.id === entry.track_id) ?? {}))}{entry.created_at ? ` · ${formatRelativeTime(entry.created_at)}` : ''}</Text>
                </div>
              </Link>
            </li>)}
          </ul> : !snapshot.isError && <Text as="p" variant="body-sm" tone="muted">Recent records across your accessible workspaces will appear here.</Text>}
        </Surface>
      </div>
    </PageSection>
  </PageShell>;
}

function HomeLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
    <Text variant="body-sm">{children}</Text><ArrowUpRight size={14} aria-hidden className="shrink-0" />
  </Link>;
}
function HomeSkeleton() {
  return <div aria-label="Loading recent work" aria-busy="true" className="space-y-4"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>;
}
