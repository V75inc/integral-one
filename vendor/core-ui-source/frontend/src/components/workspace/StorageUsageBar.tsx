import { useEffect, useState } from 'react';
import { AlertTriangle, HardDrive, Loader2 } from 'lucide-react';

import { workspacesApi } from '../../api/workspaces';
import type { WorkspaceStorageUsage } from '../../api/workspaces';
import { LINE_ICON_STROKE } from '../ui/IconWell';

/**
 * Plan 03 — Phase 5. Renders a workspace's attachment-storage
 * usage as a slim progress bar with text annotation.
 *
 * Visual states:
 *   - Unlimited quota: shows "Used: X" with no bar.
 *   - Under soft-warn threshold: neutral bar.
 *   - At/over soft-warn threshold (80% by default): warning tone.
 *   - At 100% with enforcement enabled: danger tone + explanatory note.
 *
 * Designed as a pure presentational component when an explicit
 * ``usage`` is passed; otherwise it fetches itself given just the
 * ``workspaceId``. The ``refreshKey`` prop is a cache-buster for
 * callers that want to refetch after a known mutation (e.g. after an
 * upload completes).
 */

interface StorageUsageBarProps {
  workspaceId?: string;
  usage?: WorkspaceStorageUsage;
  refreshKey?: number | string;
  className?: string;
  compact?: boolean;
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function StorageUsageBar({
  workspaceId,
  usage: usageProp,
  refreshKey,
  className = '',
  compact = false,
}: StorageUsageBarProps) {
  const [usage, setUsage] = useState<WorkspaceStorageUsage | null>(
    usageProp ?? null
  );
  const [loading, setLoading] = useState<boolean>(
    usageProp == null && Boolean(workspaceId)
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (usageProp) {
      setUsage(usageProp);
      setLoading(false);
      setError(null);
      return;
    }
    if (!workspaceId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    workspacesApi
      .getStorageUsage(workspaceId)
      .then((u) => {
        if (!cancelled) {
          setUsage(u);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load usage');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, usageProp, refreshKey]);

  if (loading) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] ${className}`}
      >
        <Loader2
          size={12}
          strokeWidth={LINE_ICON_STROKE}
          className="animate-spin"
        />
        Loading storage usage…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-xs text-[var(--danger-fg)] ${className}`}
      >
        <AlertTriangle size={12} strokeWidth={LINE_ICON_STROKE} />
        {error}
      </div>
    );
  }
  if (!usage) return null;

  if (usage.is_unlimited) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] tabular-nums ${className}`}
      >
        <HardDrive size={12} strokeWidth={LINE_ICON_STROKE} />
        {formatBytes(usage.bytes_used)} used
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, usage.percent || 0));
  const isAtCap = pct >= 100 && usage.enforcement_enabled;
  const barClass = isAtCap
    ? 'bg-[var(--danger-fg)]'
    : usage.is_soft_warning
    ? 'bg-[var(--warn-fg)]'
    : 'bg-[var(--cta-bg)]';

  const summary = `${formatBytes(usage.bytes_used)} of ${formatBytes(usage.quota_bytes)} · ${pct.toFixed(0)}%`;

  if (compact) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--panel-border)]">
          <div
            className={`h-full transition-[width] duration-fast ${barClass}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
          {summary}
        </span>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between text-xs text-[var(--text-muted)] tabular-nums">
        <span className="inline-flex items-center gap-1.5 text-[var(--text)]">
          <HardDrive size={12} strokeWidth={LINE_ICON_STROKE} />
          Storage
        </span>
        <span>{summary}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--panel-border)]">
        <div
          className={`h-full transition-[width] duration-fast ${barClass}`}
          style={{ width: `${pct}%` }}
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
          aria-label="Workspace storage usage"
        />
      </div>
      {isAtCap && (
        <p className="inline-flex items-center gap-1 text-[11px] text-[var(--danger-fg)]">
          <AlertTriangle size={11} strokeWidth={LINE_ICON_STROKE} />
          Quota reached. New uploads will be rejected until files are removed
          or the quota is raised.
        </p>
      )}
      {!isAtCap && usage.is_soft_warning && (
        <p className="text-[11px] text-[var(--warn-fg)]">
          Approaching storage quota — consider cleaning up unused
          attachments.
        </p>
      )}
    </div>
  );
}
