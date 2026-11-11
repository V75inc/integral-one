import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { Track } from '../../types';
import { useQuery } from '@tanstack/react-query';
import { dashboardsApi, isHomeComponentWidget, type AppHomeResponse } from '../../api/dashboards';
import { useScope } from '../../context/ScopeContext';
import { requestOpenCompanionChat } from '../ai-chat/chatHandoff';
import { Button, Skeleton } from '../../components/ui';
import { Surface, Text } from '../../ui';
import { DashboardWidgetRenderer } from './DashboardWidgetRegistry';
import './dashboardWidgets.css';
import { NativeHome } from './NativeHome';

/** Package-owned content on the active definition; no manual dashboard setup. */
type HomeDestinations = {
  tracks?: Pick<Track, 'id' | 'title' | 'entry_count'>[];
  hasDashboards?: boolean;
};

export function AppHomePanel({ appId, workspaceId, tracks, hasDashboards }: { appId: string; workspaceId: string } & HomeDestinations) {
  const { scope } = useScope();
  const query = useQuery({
    queryKey: ['app-home-data', appId, scope?.workspaceId],
    queryFn: () => dashboardsApi.home(appId),
    enabled: Boolean(workspaceId && workspaceId === scope?.workspaceId),
    refetchInterval: 15000,
  });
  if (query.isError && !query.data) return <div className="space-y-3"><Text as="p" tone="muted">This home could not be loaded.</Text><Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button></div>;
  if (!query.data) return <Skeleton className="h-48" />;
  return <>
    <div role="status" aria-live="polite" className="sr-only">{query.isFetching ? 'Refreshing App home.' : query.isError ? 'App home could not refresh. Showing the last loaded information.' : ''}</div>
    <AppHomeContent appId={appId} workspaceId={workspaceId} tracks={tracks} hasDashboards={hasDashboards} result={query.data} refreshVersion={query.dataUpdatedAt} onRefresh={() => void query.refetch()} />
  </>;
}

export function AppHomeContent({ appId, workspaceId, result, onRefresh, tracks, hasDashboards, refreshVersion = 0 }: { appId: string; workspaceId: string; result: AppHomeResponse; onRefresh: () => void; refreshVersion?: number } & HomeDestinations) {
  const home = result.home;
  if (!home) return <Text as="p" tone="muted">No home is available for this App.</Text>;
  const operationsOverview = home.layout === 'operations_overview';
  const resourceHub = home.layout === 'resource_hub';
  const showTitle = home.title.trim().toLowerCase() !== 'home';
  const shortcuts = (home.track_shortcuts ?? []).flatMap(name => {
    const track = tracks?.find(item => item.title.toLowerCase() === name.toLowerCase());
    return track ? [{ ...track, description: home.shortcut_descriptions?.[name] }] : [];
  });
  const actions = (home.actions || []).filter(action => {
    if (!action.when) return true;
    const widget = (home.widgets || []).find(item => item.id === action.when?.widget);
    const data = widget && !isHomeComponentWidget(widget) ? widget.data : undefined;
    if (!data || data.error || typeof data.total_matched !== 'number') return false;
    return action.when.state === 'empty' ? data.total_matched === 0 : data.total_matched > 0;
  });
  const content = home.renderer === 'native' && home.content ? <NativeHome appId={appId} workspaceId={workspaceId} node={home.content} preview={Boolean(result.preview)} liveData={!result.preview || Boolean(result.live_data)} refreshVersion={refreshVersion} onChanged={onRefresh} /> : <div className="app-home-grid grid gap-4">
    {(home.widgets || []).map(widget => <div key={widget.id} className="app-home-widget min-w-0" style={{
      '--home-widget-column': `${widget.grid.x + 1} / span ${widget.grid.w}`,
      '--home-widget-row': `${widget.grid.y + 1} / span ${widget.grid.h}`,
    } as CSSProperties}>
      {isHomeComponentWidget(widget) ? <NativeHome appId={appId} workspaceId={workspaceId} node={widget.content} preview={Boolean(result.preview)} liveData={!result.preview || Boolean(result.live_data)} refreshVersion={refreshVersion} onChanged={onRefresh} /> : result.preview && !result.live_data ? <Surface tone="panel" className="space-y-2 p-4"><Text as="h3" variant="heading-sm">{widget.title}</Text><Text as="p" tone="muted" variant="body-sm">Enable live data to preview this widget.</Text></Surface> : widget.data?.error ? <Surface tone="panel" className="space-y-3 p-4">
        <Text as="h3" variant="heading-sm">{widget.title}</Text>
        <Text as="p" tone="muted" variant="body-sm">We couldn’t read this information right now.</Text>
        <Button variant="secondary" onClick={onRefresh}>Try again</Button>
      </Surface> : <DashboardWidgetRenderer type={widget.type} title={widget.title || ''} data={widget.data} config={widget.config} />}
    </div>)}
  </div>;
  const navigation = !result.preview && shortcuts.length ? (
    <nav aria-label="Key Tracks" className="space-y-2">
      <Text as="h3" variant="heading-sm">{resourceHub ? 'Browse resources' : operationsOverview ? 'Track overview' : 'Go to'}</Text>
      <div className={`grid gap-3 sm:grid-cols-2 ${operationsOverview ? '' : 'lg:grid-cols-3'}`}>
        {shortcuts.map(track => (
          <Link key={track.id} to={`/tracks/${encodeURIComponent(track.id)}`} className="rounded-[var(--radius-card)] border border-[var(--border)] p-4 hover:underline">
            <Text as="p" variant="heading-sm">{track.title}</Text>
            {track.description && <Text as="p" tone="muted" variant="body-sm">{track.description.trim().replace(/\s+/g, ' ')}</Text>}
            {!resourceHub && typeof track.entry_count === 'number' && (
              <Text as="p" tone="muted" variant="body-sm">{track.entry_count} {track.entry_count === 1 ? 'entry' : 'entries'}</Text>
            )}
          </Link>
        ))}
      </div>
      {hasDashboards ? <Link to={`/apps/${encodeURIComponent(appId)}?section=dashboards`} className="inline-block underline underline-offset-4"><Text as="span" variant="body-sm">View dashboards</Text></Link> : null}
    </nav>
  ) : null;
  const actionButtons = actions.length ? (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, index) => (
        <Button
          key={action.label}
          variant={(home.layout || shortcuts.length) && index === 0 ? 'primary' : 'secondary'}
          disabled={result.preview}
          onClick={() => requestOpenCompanionChat({ draftText: action.draft })}
        >
          {action.label}
        </Button>
      ))}
    </div>
  ) : null;
  return (
    <section aria-label={home.title} className="app-home-section space-y-5">
      {showTitle || home.description ? <div className="space-y-2">
        {showTitle ? <Text as="h2" variant="heading-md">{home.title}</Text> : null}
        {home.description ? <Text as="p" tone="muted" variant="body-sm">{home.description.trim().replace(/\s+/g, ' ')}</Text> : null}
      </div> : null}
      {home.layout && actionButtons}
      {operationsOverview && navigation ? (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {navigation}
          {content}
        </div>
      ) : resourceHub ? (
        <>{navigation}{content}</>
      ) : (
        <>{content}{navigation}</>
      )}
      {!home.layout && actionButtons}
    </section>
  );
}
