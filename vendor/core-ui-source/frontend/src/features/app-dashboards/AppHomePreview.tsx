import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardsApi, type AppHome } from '../../api/dashboards';
import { useScope } from '../../context/ScopeContext';
import { Button, Skeleton } from '../../components/ui';
import { Text } from '../../ui';
import { AppHomeContent } from './AppHomePanel';

export function AppHomePreview({ appId, home }: { appId: string; home: AppHome | Record<string, never> }) {
  const { scope } = useScope();
  const [liveData, setLiveData] = useState(false);
  const query = useQuery({ queryKey: ['app-home-preview', appId, scope?.workspaceId, home, liveData], queryFn: () => dashboardsApi.previewHome(appId, home, liveData), enabled: Boolean(scope?.workspaceId), retry: false });
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Text as="p" variant="body-sm" tone="muted">Preview · {liveData ? 'Live data' : 'Data hidden'} · Actions disabled</Text>
      <Button variant="secondary" size="sm" onClick={() => setLiveData(value => !value)}>{liveData ? 'Hide live data' : 'Preview with live data'}</Button>
    </div>
    {query.isError ? <Text as="p" tone="danger">This Home cannot be previewed. Check the proposed layout and component settings.</Text> : query.data ? <AppHomeContent appId={appId} workspaceId={scope?.workspaceId || ''} result={query.data} refreshVersion={query.dataUpdatedAt} onRefresh={() => void query.refetch()} /> : <Skeleton className="h-48" />}
  </div>;
}
