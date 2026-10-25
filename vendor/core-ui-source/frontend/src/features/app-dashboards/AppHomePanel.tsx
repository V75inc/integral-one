import type { CSSProperties } from 'react';
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
export function AppHomePanel({ appId, workspaceId }: { appId: string; workspaceId: string }) {
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
    <AppHomeContent appId={appId} workspaceId={workspaceId} result={query.data} refreshVersion={query.dataUpdatedAt} onRefresh={() => void query.refetch()} />
  </>;
}

export function AppHomeContent({ appId, workspaceId, result, onRefresh, refreshVersion = 0 }: { appId: string; workspaceId: string; result: AppHomeResponse; onRefresh: () => void; refreshVersion?: number }) {
  const home = result.home;
  if (!home) return <Text as="p" tone="muted">No home is available for this App.</Text>;
  const showTitle = home.title.trim().toLowerCase() !== 'home';
  const actions = (home.actions || []).filter(action => {
    if (!action.when) return true;
    const widget = (home.widgets || []).find(item => item.id === action.when?.widget);
    const data = widget && !isHomeComponentWidget(widget) ? widget.data : undefined;
    if (!data || data.error || typeof data.total_matched !== 'number') return false;
    return action.when.state === 'empty' ? data.total_matched === 0 : data.total_matched > 0;
  });
  return (
    <section aria-label={home.title} className="app-home-section space-y-5">
      {showTitle || home.description ? <div className="space-y-2">
        {showTitle ? <Text as="h2" variant="heading-md">{home.title}</Text> : null}
        {home.description ? <Text as="p" tone="muted" variant="body-sm">{home.description}</Text> : null}
      </div> : null}
      {actions.length ? <div className="flex flex-wrap gap-2">{actions.map(action => <Button key={action.label} variant="secondary" disabled={result.preview} onClick={() => requestOpenCompanionChat({ draftText: action.draft })}>{action.label}</Button>)}</div> : null}
      {home.renderer === 'native' && home.content ? <NativeHome appId={appId} workspaceId={workspaceId} node={home.content} preview={Boolean(result.preview)} liveData={!result.preview || Boolean(result.live_data)} refreshVersion={refreshVersion} onChanged={onRefresh} /> : <div className="app-home-grid grid grid-cols-1 gap-4">
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
      </div>}
    </section>
  );
}
