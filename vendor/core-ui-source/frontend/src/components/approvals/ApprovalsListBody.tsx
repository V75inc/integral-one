import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Check, X } from 'lucide-react';
import { EmptyState, IconWell, LINE_ICON_STROKE } from '../ui';
import { formatRelativeTime } from '../../utils';
import { approvalChanges, approvalResourceHref, approvalSummary } from './approvalPresentation';
import {
  approveApproval,
  rejectApproval,
  type ApprovalResponse,
} from '../../api/approvals';

interface ApprovalsListBodyProps {
  rows: ApprovalResponse[];
  loading: boolean;
  error: string | null;
  onRetry(): void;
  onDecide?(): void;
  compact?: boolean;
  /**
   * Suppress the "No pending approvals" card when this list is empty.
   *
   * This body only knows about policy-gated approvals, but its empty state
   * is worded as though it speaks for the whole surface. On the Approvals
   * page a second list (staged chat changes) renders below it, so an empty
   * policy list would otherwise announce "No pending approvals" directly
   * above a pending one. The page passes this when that second list has
   * rows; it then owns the messaging.
   */
  hideEmptyState?: boolean;
}

export function ApprovalsListBody({
  rows,
  loading,
  error,
  onRetry,
  onDecide,
  compact,
  hideEmptyState = false,
}: ApprovalsListBodyProps) {
  if (error) {
    return (
      <div
        className="rounded-[var(--radius-card)] border border-[color:var(--danger-fg)]/30 bg-[var(--danger-bg)] px-4 py-3 text-sm text-[var(--danger-fg)]"
        role="alert"
      >
        {error}
        <button type="button" className="ml-3 underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        {(compact ? [1, 2, 3, 4] : [1, 2, 3, 4, 5]).map(i => (
          <div
            key={i}
            className={`bg-[var(--panel-2)] rounded-lg animate-pulse ${
              compact ? 'h-14' : 'h-16'
            }`}
          />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    if (hideEmptyState) return null;
    return (
      <EmptyState
        surface="card"
        icon={
          <IconWell size="lg" aria-hidden>
            <ShieldCheck size={22} strokeWidth={LINE_ICON_STROKE} />
          </IconWell>
        }
        title="No pending approvals"
        description="Requests that need your approval will appear here."
      />
    );
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {rows.map(pw => (
        <ApprovalRow
          key={pw.id}
          approval={pw}
          onDecide={onDecide}
          compact={compact}
        />
      ))}
    </div>
  );
}

function ApprovalRow({
  approval,
  onDecide,
  compact,
}: {
  approval: ApprovalResponse;
  onDecide?: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<'approved' | 'rejected' | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const [showPayload, setShowPayload] = useState(false);

  const effectiveStatus = outcome ?? approval.status;
  const isPending = effectiveStatus === 'pending';
  const changes = approvalChanges(approval);
  const resourceHref = approvalResourceHref(approval);

  const handleApprove = async () => {
    if (busy || !isPending) return;
    setBusy(true);
    setRowError(null);
    try {
      await approveApproval(approval.id);
      setOutcome('approved');
      onDecide?.();
    } catch (err) {
      setRowError(
        err instanceof Error ? err.message : 'Failed to approve',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (busy || !isPending) return;
    const reason = window.prompt(
      'Reject this pending write?\nOptional reason (visible in audit log):',
      '',
    );
    if (reason === null) return;
    setBusy(true);
    setRowError(null);
    try {
      await rejectApproval(approval.id, reason || undefined);
      setOutcome('rejected');
      onDecide?.();
    } catch (err) {
      setRowError(
        err instanceof Error ? err.message : 'Failed to reject',
      );
    } finally {
      setBusy(false);
    }
  };

  // Status dot tone keyed to Integral semantic tokens — mirrors
  // NotificationsListBody's unread-dot pattern but uses the warn/success/
  // danger accent so the row reads its decision state at a glance.
  const dotClass =
    effectiveStatus === 'pending'
      ? 'bg-[var(--warn-fg)]'
      : effectiveStatus === 'approved'
        ? 'bg-[var(--success-fg)]'
        : effectiveStatus === 'rejected'
          ? 'bg-[var(--danger-fg)]'
          : 'bg-[var(--panel-border)]';

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border transition-all ${
        compact ? 'p-3' : 'p-4 gap-4'
      } ${
        isPending
          ? 'bg-[var(--nav-active-bg)] border-[var(--panel-border)]'
          : 'bg-[var(--panel)] border-[var(--panel-border)]'
      }`}
    >
      <div
        className={`rounded-full mt-1.5 shrink-0 ${
          compact ? 'w-2 h-2' : 'w-2.5 h-2.5'
        } ${dotClass}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm ${
            isPending
              ? 'text-[var(--text)] font-medium'
              : 'text-[var(--text-muted)]'
          }`}
        >
          {approvalSummary(approval)}
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {isPending
            ? `Awaiting a decision · expires ${formatRelativeTime(approval.expires_at)}`
            : `${effectiveStatus} · decided ${formatRelativeTime(
                approval.decided_at || approval.created_at,
              )}`}
        </p>
        {changes.length > 0 && (
          <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[max-content_1fr]">
            {changes.map(change => (
              <div key={change.label} className="contents">
                <dt className="text-[var(--text-subtle)]">{change.label}</dt>
                <dd className="min-w-0 truncate text-[var(--text-muted)]">
                  {change.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          {resourceHref && (
            <Link
              to={resourceHref}
              className="text-[11px] text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
            >
              Review affected record
            </Link>
          )}
          <button
            type="button"
            onClick={() => setShowPayload(s => !s)}
            className="text-[11px] text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
          >
            {showPayload ? 'Hide technical details' : 'Show technical details'}
          </button>
        </div>
        {showPayload && (
          <pre className="mt-1.5 overflow-x-auto rounded-[var(--radius-input)] bg-[var(--panel-2)] text-[var(--text)] border border-[var(--panel-border)] p-2 text-[11px]">
            {JSON.stringify(approval.payload, null, 2)}
          </pre>
        )}
        {rowError && (
          <div className="mt-2 rounded-[var(--radius-input)] bg-[var(--danger-bg)] text-[var(--danger-fg)] border border-[color:var(--danger-fg)]/20 px-2 py-1 text-[11px]">
            {rowError}
          </div>
        )}
      </div>
      {isPending && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={handleApprove}
            aria-label="Approve"
            className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--success-fg)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={14} strokeWidth={LINE_ICON_STROKE} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleReject}
            aria-label="Reject"
            className="p-1.5 rounded-lg hover:bg-[var(--panel-2)] text-[var(--danger-fg)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X size={14} strokeWidth={LINE_ICON_STROKE} />
          </button>
        </div>
      )}
    </div>
  );
}
