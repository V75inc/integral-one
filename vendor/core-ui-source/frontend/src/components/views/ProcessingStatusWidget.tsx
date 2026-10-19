import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

import { entriesApi } from '../../api';
import { toolsApi } from '../../api/tools';
import { workItemsApi, type WorkItemStatusResponse } from '../../api/workItems';
import { Surface, Text } from '../../ui';
import { Button } from '../ui/Button';
import type { Entry } from '../../types';
import type { ViewWidgetProps } from './types';

/**
 * ``region-system/processing-status`` — a generic progress panel for a record
 * that some background work is acting on (a long import, a batch run, an
 * App job). Everything comes from config and the bound entry's own fields:
 *
 * - ``status_field`` (default ``status``) — the record's state.
 * - ``stages`` — ``[{label, statuses: [...]}]`` drawn as a progress track.
 * - ``active_statuses`` / ``failed_statuses`` — which states mean working / stopped.
 * - ``status_labels`` — optional ``{status: label}`` for the pill.
 * - ``progress_field`` / ``error_field`` — readable text fields on the entry.
 * - ``job_field`` — optional field holding a Core work item id; when set, its
 *   reported progress (done/total/label) is shown and refreshed.
 * - ``retry`` — optional ``{tool, label}`` offered when the record is stopped.
 * - ``title`` — optional heading. ``poll_seconds`` (default 4) while active.
 */
interface StageSpec {
  label: string;
  statuses: string[];
}

interface ProcessingStatusConfig {
  title?: string;
  status_field?: string;
  stages?: StageSpec[];
  active_statuses?: string[];
  failed_statuses?: string[];
  status_labels?: Record<string, string>;
  progress_field?: string;
  error_field?: string;
  job_field?: string;
  retry?: { tool?: string; label?: string };
  poll_seconds?: number;
  __bindings?: { entryId?: string };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function ProcessingStatusWidget({ view }: ViewWidgetProps) {
  const config = (view.config || {}) as ProcessingStatusConfig;
  const entryId = typeof config.__bindings?.entryId === 'string' ? config.__bindings.entryId : undefined;
  const statusField = config.status_field || 'status';
  const active = new Set(config.active_statuses || []);
  const failed = new Set(config.failed_statuses || []);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [job, setJob] = useState<WorkItemStatusResponse | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const generation = useRef(0);

  const load = useCallback(async () => {
    if (!entryId) return;
    const current = ++generation.current;
    try {
      const fetched = await entriesApi.get(entryId);
      if (current !== generation.current) return;
      setEntry(fetched);
      const jobId = config.job_field ? text((fetched.custom_fields || {})[config.job_field]) : '';
      if (jobId) {
        try {
          const status = await workItemsApi.get(jobId);
          if (current === generation.current) setJob(status);
        } catch {
          if (current === generation.current) setJob(null);
        }
      } else {
        setJob(null);
      }
    } catch {
      if (current === generation.current) setEntry(null);
    }
  }, [entryId, config.job_field]);

  useEffect(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]);

  const fields = (entry?.custom_fields || {}) as Record<string, unknown>;
  const status = text(fields[statusField]);
  const isActive = active.has(status);
  const isFailed = failed.has(status);

  useEffect(() => {
    if (!isActive) return;
    const seconds = Math.min(Math.max(Number(config.poll_seconds) || 4, 2), 60);
    const timer = window.setInterval(() => { void load(); }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [isActive, config.poll_seconds, load]);

  if (!entryId) return null;
  if (!entry) {
    return <Surface tone="panel-2" radius="card" className="h-20 animate-pulse">{null}</Surface>;
  }

  const stages = config.stages || [];
  const at = stages.findIndex(stage => (stage.statuses || []).includes(status));
  const pillLabel = config.status_labels?.[status] || status.replace(/_/g, ' ');
  const progressText = text(job?.progress?.label) || (config.progress_field ? text(fields[config.progress_field]) : '');
  const errorText = (config.error_field ? text(fields[config.error_field]) : '') || text(job?.failure?.message);
  const done = job?.progress?.done;
  const total = job?.progress?.total;
  const pct = typeof done === 'number' && typeof total === 'number' && total > 0
    ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : null;
  const pillTone = isFailed
    ? 'bg-[var(--danger-bg)] text-[var(--danger-fg)]'
    : isActive
      ? 'bg-[var(--info-bg)] text-[var(--info-fg)]'
      : at >= 0 && at === stages.length - 1
        ? 'bg-[var(--success-bg)] text-[var(--success-fg)]'
        : 'bg-[var(--badge-muted-bg)] text-[var(--badge-muted-fg)]';

  const retry = async () => {
    if (!config.retry?.tool) return;
    setRetrying(true);
    setRetryError('');
    try {
      const { output } = await toolsApi.call(config.retry.tool, { entry_id: entryId });
      if (output && (output as { ok?: unknown }).ok === false) {
        setRetryError(text((output as { reason?: unknown }).reason) || 'Could not start again.');
      }
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : 'Could not start again.');
    } finally {
      setRetrying(false);
      void load();
    }
  };

  return (
    <Surface tone="panel" border="subtle" radius="card" padding="md" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {config.title && <Text as="h3" weight="medium">{config.title}</Text>}
        {status && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${pillTone}`}>
            {isActive && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            {isFailed && <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />}
            {!isActive && !isFailed && at >= 0 && at === stages.length - 1 && <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
            {pillLabel}
          </span>
        )}
        {isActive && progressText && <Text as="span" variant="body-sm" tone="muted" className="min-w-0">{progressText}</Text>}
      </div>

      {stages.length > 0 && (
        <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))` }}>
          {stages.map((stage, i) => {
            const rail = i < at
              ? 'bg-[var(--success-fg)] opacity-60'
              : isFailed ? 'bg-[var(--danger-fg)]' : 'bg-[var(--brand-accent)]';
            return (
              <li key={stage.label} className="min-w-0 space-y-1" aria-current={i === at ? 'step' : undefined}>
                {i <= at
                  ? <div className={`h-1 rounded-full ${rail}`} />
                  : <Surface tone="panel-2" radius="pill" className="h-1">{null}</Surface>}
                <Text as="p" variant="meta" tone={i > at ? 'subtle' : undefined} className="truncate">{stage.label}</Text>
              </li>
            );
          })}
        </ol>
      )}

      {isActive && pct !== null && (
        <Surface tone="panel-2" radius="pill" className="h-1.5 overflow-hidden" role="progressbar"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progress">
          <div className="h-full rounded-full bg-[var(--brand-accent)] transition-[width]" style={{ width: `${pct}%` }} />
        </Surface>
      )}

      {isFailed && (
        <div className="space-y-2 rounded-[var(--radius-input)] bg-[var(--danger-bg)] p-3" role="alert">
          <Text as="p" variant="body-sm">{errorText || 'This stopped before it finished.'}</Text>
          {retryError && <Text as="p" variant="body-sm" tone="danger">{retryError}</Text>}
          {config.retry?.tool && (
            <Button size="sm" loading={retrying} onClick={() => void retry()}>
              {config.retry.label || 'Try again'}
            </Button>
          )}
        </div>
      )}
    </Surface>
  );
}
