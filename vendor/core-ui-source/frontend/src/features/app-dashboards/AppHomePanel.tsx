import type { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardsApi } from '../../api/dashboards';
import { useScope } from '../../context/ScopeContext';
import { requestOpenCompanionChat } from '../ai-chat/chatHandoff';
import { Button, Skeleton } from '../../components/ui';
import { Surface, Text } from '../../ui';
import { DashboardWidgetRenderer } from './DashboardWidgetRegistry';
import './dashboardWidgets.css';

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
  const home = query.data.home;
  if (!home) return <Text as="p" tone="muted">No home is available for this App.</Text>;
  const actions = home.actions.filter(action => {
    if (!action.when) return true;
    const data = home.widgets.find(widget => widget.id === action.when?.widget)?.data;
    if (!data || data.error || typeof data.total_matched !== 'number') return false;
    return action.when.state === 'empty' ? data.total_matched === 0 : data.total_matched > 0;
  });
  return (
    <section aria-label={home.title} className="app-home-section space-y-5">
      <div className="space-y-2">
        <Text as="h2" variant="heading-md">{home.title}</Text>
        {home.description ? <Text as="p" tone="muted" variant="body-sm">{home.description}</Text> : null}
      </div>
      <div role="status" aria-live="polite" className="sr-only">
        {query.isFetching ? 'Refreshing App home.' : query.isError ? 'App home could not refresh. Showing the last loaded information.' : ''}
      </div>
      {actions.length ? <div className="flex flex-wrap gap-2">{actions.map(action => <Button key={action.label} variant="secondary" onClick={() => requestOpenCompanionChat({ draftText: action.draft })}>{action.label}</Button>)}</div> : null}
      <div className="app-home-grid grid grid-cols-1 gap-4">
        {home.widgets.map(widget => <div key={widget.id} className="app-home-widget min-w-0" style={{
          '--home-widget-column': `${widget.grid.x + 1} / span ${widget.grid.w}`,
          '--home-widget-row': `${widget.grid.y + 1} / span ${widget.grid.h}`,
        } as CSSProperties}>
          {widget.data?.error ? <Surface tone="panel" className="space-y-3 p-4">
            <Text as="h3" variant="heading-sm">{widget.title}</Text>
            <Text as="p" tone="muted" variant="body-sm">We couldn’t read this information right now.</Text>
            <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Try again</Button>
          </Surface> : <DashboardWidgetRenderer type={widget.type} title={widget.title} data={widget.data} config={widget.config} />}
        </div>)}
      </div>
    </section>
  );
}
