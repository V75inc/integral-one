import { useSingleFlight } from '../../hooks/useSingleFlight';
import { useSerialPolling } from '../../hooks/useSerialPolling';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, LINE_ICON_STROKE } from '../ui';
import { Surface, Text } from '../../ui';
import { workItemsApi, type WorkItemStatusResponse } from '../../api/workItems';
import { formatRelativeTime } from '../../utils';

const terminal = new Set(['succeeded', 'failed', 'cancelled', 'expired', 'dead_letter']);
const completedWorkStatuses = new Set(['succeeded', 'cancelled', 'expired']);
const operationLabels: Record<string, string> = { install: 'App install', upgrade: 'App update', uninstall: 'App uninstall', resume: 'App resume' };
const statusLabels: Record<string, string> = {
  queued: 'Queued', running: 'Running', waiting_for_human: 'Awaiting your input',
  waiting_for_event: 'Waiting for an event', retry_wait: 'Waiting to retry',
  succeeded: 'Completed', failed: 'Failed', cancelled: 'Cancelled', expired: 'Expired',
  dead_letter: 'Needs attention',
};

function workTitle(item: WorkItemStatusResponse): string {
  if (item.kind === 'app_lifecycle') return operationLabels[item.operation ?? ''] ?? 'App lifecycle';
  if (item.kind === 'app_tool') return item.label || 'App job';
  return item.kind.replace(/_/g, ' ');
}

function workProgress(item: WorkItemStatusResponse) {
  const progress = item.progress;
  if (!progress || terminal.has(item.status)) return null;
  const { done, total, label } = progress;
  const pct = typeof done === 'number' && typeof total === 'number' && total > 0
    ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : null;
  if (!label && pct === null) return null;
  return <div className="space-y-1.5">
    {label && <Text as="p" variant="body-sm" tone="muted">{label}</Text>}
    {pct !== null && <Surface tone="panel-2" radius="pill" className="h-1.5 overflow-hidden" role="progressbar"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress">
      <div className="h-full rounded-full bg-[var(--brand-accent)]" style={{ width: `${pct}%` }} />
    </Surface>}
  </div>;
}

/** Workspace-keyed by the parent; superseded requests never publish old state. */
export function WorkItemsSection({ workspaceId }: { workspaceId: string }) {
  const [items, setItems] = useState<WorkItemStatusResponse[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useSingleFlight(useCallback(async (after?: string) => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await workItemsApi.list(workspaceId, after);
      if (current !== generation.current) return;
      setItems(previous => after ? [...previous, ...result.items.filter(item =>
        !previous.some(old => old.work_item_id === item.work_item_id))] : result.items);
      setCursor(result.next_cursor);
    } catch (err) {
      if (current === generation.current)
        setError(err instanceof Error ? err.message : 'Could not load work status');
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [workspaceId]));
  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);
  useSerialPolling(load, 5000, items.some(item =>
    item.kind !== 'routine_turn' && item.kind !== 'chat_turn' && !terminal.has(item.status)));


  // This panel is an operational monitor, not a history feed. Routine runs
  // and chat turns have dedicated activity views; successful/cancelled work
  // is complete and does not need a permanent row here.
  const visibleItems = items.filter(item =>
    item.kind !== 'routine_turn'
      && item.kind !== 'chat_turn'
      && !completedWorkStatuses.has(item.status),
  );

  if (!error && visibleItems.length === 0 && !cursor) return null;

  return <Surface as="section" aria-label="Active workspace tasks" tone="panel" border="subtle" radius="card" padding="lg">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 flex-1 basis-64">
        <Text as="h2" variant="heading-md">Active workspace tasks</Text>
        <Text as="p" tone="muted" variant="subtitle" className="mt-1">
          Installs, updates, and other background tasks that are running or need attention.
        </Text>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        loading={loading}
        aria-label="Refresh"
        aria-busy={loading}
        icon={<RefreshCw size={14} strokeWidth={LINE_ICON_STROKE} aria-hidden />}
        className="shrink-0"
        onClick={() => void load()}
      >
        {loading ? 'Refreshing…' : 'Refresh'}
      </Button>
    </header>
    <div className="mt-5">
      {error && <div role="alert"><Text tone="danger">{error}</Text></div>}
      {loading && <div role="status"><Text variant="meta">Loading work status…</Text></div>}
      {visibleItems.length > 0 && <ul className="mt-2 divide-y divide-[var(--panel-border)]">
        {visibleItems.map(item => <li key={item.work_item_id} className="flex min-w-0 flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 first:pt-1">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Text as="span" weight="medium">{workTitle(item)}</Text>
              <Text as="span" variant="meta" tone="muted">{statusLabels[item.status] ?? item.status}</Text>
            </div>
            <Text as="p" variant="meta" tone="subtle" className="mt-0.5">Updated {formatRelativeTime(item.updated_at)} · Attempt {item.attempt}</Text>
            {workProgress(item)}
            {item.failure && <Text as="p" variant="body-sm" tone="danger" className="mt-1">{item.failure.message || item.failure.code}</Text>}
            {item.next_attempt_at && item.status === 'retry_wait' && <Text as="p" variant="meta" className="mt-1">Next attempt: {formatRelativeTime(item.next_attempt_at)}</Text>}
          </div>
        </li>)}
      </ul>}
      {cursor && <Button className="mt-2" disabled={loading} onClick={() => void load(cursor)}>Load more tasks</Button>}
    </div>
  </Surface>;
}
