import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { Button, LINE_ICON_STROKE, PageHeading, PageMeta, PageShell, PageSection } from '../ui';
import { Select, Surface, Text } from '../../ui';
import { useScopeOptional } from '../../context/ScopeContext';
import { WorkItemsSection } from './WorkItemsSection';
import { useSetCrumbs } from '../../context/CrumbsContext';
import {
  getRoutine,
  listRoutines,
  type RoutineResponse,
  type RoutineStatus,
} from '../../api/routines';
import { RoutinesListBody } from './RoutinesListBody';

type StatusFilter = RoutineStatus | 'all';

export function BackgroundTasksPage() {
  useSetCrumbs([{ label: 'Background Tasks' }]);
  const { hash, search } = useLocation();
  const selectedRoutineId = new URLSearchParams(search).get('routine') || '';
  const workspaceId = useScopeOptional()?.scope?.workspaceId;

  useEffect(() => {
    if (hash === '#scheduled-routines') {
      document.getElementById('scheduled-routines')?.scrollIntoView?.({ block: 'start' });
    }
  }, [hash]);

  const [selectedRoutine, setSelectedRoutine] = useState<RoutineResponse | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [rows, setRows] = useState<RoutineResponse[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestGeneration = useRef(0);
  const refetch = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setLoading(true);
    setError(null);
    try {
      const data = await listRoutines(
        statusFilter === 'all' ? {} : { status: statusFilter },
      );
      if (generation !== requestGeneration.current) return;
      setRows(data.routines);
      setSelectedRoutine(null);
      setSelectionError(null);
      if (selectedRoutineId && !data.routines.some(row => row.id === selectedRoutineId)) {
        try {
          const selected = await getRoutine(selectedRoutineId);
          if (generation === requestGeneration.current) setSelectedRoutine(selected);
        } catch {
          if (generation === requestGeneration.current) setSelectionError('This routine is unavailable or you no longer have access to it.');
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to load background tasks';
      if (generation === requestGeneration.current) setError(msg);
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [statusFilter, selectedRoutineId, workspaceId]);

  useEffect(() => {
    void refetch();
    return () => { requestGeneration.current += 1; };
  }, [refetch]);

  const visibleRows = selectedRoutine ? [selectedRoutine, ...rows] : rows;
  const activeCount = visibleRows.filter(r => r.status === 'active').length;

  return (
    <PageShell>
      <PageSection>
        <header className="mb-8 md:mb-10 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1 basis-96">
            <PageHeading className="[&>span:last-child]:whitespace-normal [&>span:last-child]:text-clip">Background Tasks</PageHeading>
            <PageMeta>
              <span>
                {visibleRows.length} {visibleRows.length === 1 ? 'scheduled routine' : 'scheduled routines'}
              </span>
              <span aria-hidden>·</span>
              <span>
                {statusFilter === 'all'
                  ? activeCount === 0
                    ? 'No active routines'
                    : `${activeCount} active`
                  : `Showing ${statusFilter}`}
              </span>
            </PageMeta>
          </div>
          <label className="flex max-w-full items-center gap-2">
            <Text as="span" tone="muted" variant="label" className="shrink-0">Routine status</Text>
            <Select
              size="sm"
              value={statusFilter}
              onChange={e =>
                setStatusFilter(e.target.value as StatusFilter)
              }
            >
              <option value="all">All (excl. cancelled)</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Select>
          </label>
        </header>
      </PageSection>

      {workspaceId && <PageSection>
        <WorkItemsSection key={workspaceId} workspaceId={workspaceId} />
      </PageSection>}
      <PageSection className="mt-8">
        <Surface id="scheduled-routines" as="section" aria-label="Scheduled routines" tone="panel" border="subtle" radius="card" padding="lg">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1 basis-64">
              <Text as="h2" variant="heading-md">Scheduled routines</Text>
              <Text as="p" tone="muted" variant="subtitle" className="mt-1">
                Tasks scheduled in chat, including reminders and recurring work.
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
              onClick={() => void refetch()}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </header>
          <div className="mt-5">
            {selectedRoutine && <Text as="p" variant="meta" tone="muted" className="mb-3">The linked routine is shown even though it is outside this filter.</Text>}
            {selectionError && <div role="status" className="mb-3"><Text as="p" tone="muted">{selectionError}</Text></div>}
            <RoutinesListBody
              rows={visibleRows}
              selectedRoutineId={selectedRoutineId}
              loading={loading}
              error={error}
              onRetry={() => void refetch()}
              onChanged={() => void refetch()}
            />
          </div>
        </Surface>
      </PageSection>
    </PageShell>
  );
}
