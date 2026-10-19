import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Clock,
  Eye,
  Pause,
  Play,
  ShieldCheck,
  Square,
  Trash2,
  X,
} from 'lucide-react';

import {
  cancelRoutine,
  deleteRoutine,
  updateRoutine,
  type RoutineResponse,
} from '../../../api/routines';
import { LINE_ICON_STROKE } from '../../../components/ui';
import { Text } from '../../../ui';
import { formatRelativeTime } from '../../../utils';
import { useStagedChange } from '../staging/useStagedChange';
import type { StagedChange } from '../staging/types';
import { StagedChangeReviewModal } from '../staging/StagedChangeReviewModal';
import { useConfirm } from '../../../context/ConfirmContext';
import { useAgentInbox } from './useAgentInbox';
import './inbox.css';

/**
 * One place to see what the agent is waiting on.
 *
 * Sections link out to the full surfaces rather than replacing them —
 * `/approvals` and `/background-tasks` remain the places to manage these at
 * length. This is the answer to "is anything waiting on me?", which
 * previously required checking four separate places.
 *
 * Scheduled rows carry Pause / Stop / Remove in place; edit + activity still
 * live on `/background-tasks`.
 */
export function InboxView() {
  const { staged, approvals, routines, loading, degraded, refetch } =
    useAgentInbox();
  // design_proposal cards retired — outlines live in chat + artifacts.
  const writeStaged = staged.filter((sc) => sc.kind !== 'design_proposal');

  const empty =
    !loading &&
    !degraded &&
    writeStaged.length === 0 &&
    approvals.length === 0 &&
    routines.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 py-3">
      {degraded ? (
        <Text variant="meta" tone="warn" as="p">
          Some items could not be loaded. Showing the last available results.
          <button type="button" onClick={refetch} disabled={loading} className="inbox-inline-link ml-1.5">
            Retry
          </button>
        </Text>
      ) : null}

      {loading ? (
        <Text variant="body-sm" tone="muted" as="p">
          Loading…
        </Text>
      ) : null}

      {empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 py-10 text-center">
          <ShieldCheck size={20} strokeWidth={LINE_ICON_STROKE} aria-hidden />
          <Text variant="body-sm" weight="medium" as="p">
            Nothing waiting on you
          </Text>
          <Text variant="meta" tone="muted" as="p" className="leading-normal">
            Changes the agent stages, and anything its policies gate, land here.
          </Text>
        </div>
      ) : null}

      {writeStaged.length > 0 ? (
        <Section title="Staged changes" to="/approvals" linkLabel="Approvals">
          {writeStaged.map((sc) => (
            <StagedRow key={sc.token} staged={sc} onResolved={refetch} />
          ))}
        </Section>
      ) : null}

      {approvals.length > 0 ? (
        <Section title="Policy approvals" to="/approvals" linkLabel="Approvals">
          {approvals.map((a) => (
            <div key={a.id} className="inbox-row rounded-[var(--radius-input)] px-2.5 py-2">
              <Text variant="body-sm" weight="medium" as="p" className="block">
                {a.action}
              </Text>
              <Text variant="meta" tone="muted" as="p" className="block">
                {a.resource_kind} · requested {formatRelativeTime(a.created_at)}
              </Text>
            </div>
          ))}
        </Section>
      ) : null}

      {routines.length > 0 ? (
        <Section
          title="Scheduled"
          to="/background-tasks"
          linkLabel="Background tasks"
        >
          {routines.map((r) => (
            <ScheduledRow key={r.id} routine={r} onResolved={refetch} />
          ))}
        </Section>
      ) : null}
    </div>
  );
}

function Section({
  title,
  to,
  linkLabel,
  children,
}: {
  title: string;
  to: string;
  linkLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Text
          variant="meta"
          weight="semibold"
          tone="subtle"
          as="h3"
          className="uppercase tracking-[0.08em]"
        >
          {title}
        </Text>
        <Link to={to} className="inbox-section-link">
          <Text variant="meta" tone="muted">
            {linkLabel}
          </Text>
        </Link>
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

/**
 * A staged change, approvable in place.
 *
 * Uses the same `useStagedChange` hook the chat card does, so approving here
 * runs the same server decision and cache invalidation as chat. The review
 * modal shares this hook; it does not create a second decision state machine.
 */
function StagedRow({
  staged,
  onResolved,
}: {
  staged: StagedChange;
  onResolved: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const confirm = useConfirm();
  const controls = useStagedChange(staged, {
    onTerminal: onResolved,
    onNeedsStrongConfirmation: (summary) =>
      confirm({
        title: 'Confirm high-impact change',
        message: `This is a high-impact change. Review the affected records, access, or structure, then confirm this exact action: ${summary}`,
        confirmLabel: 'Confirm change',
        variant: 'danger',
      }),
  });
  const { busy, error, revoke, isBlessed } = controls;

  return (
    <div className="inbox-row rounded-[var(--radius-input)] px-2.5 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Text variant="body-sm" weight="medium" as="p" className="block">
            {staged.summary}
          </Text>
          <Text variant="meta" tone="muted" as="p" className="block">
            {/* `blessed` means approved, not applied — say so rather than
                letting an approved-but-unwritten change look identical to one
                still awaiting a decision. */}
            {isBlessed ? 'approved · not yet applied' : staged.kind}
            {' · expires '}
            {formatRelativeTime(staged.expires_at)}
            <button type="button" onClick={() => setReviewOpen(true)} className="inbox-inline-link ml-1.5">
              Review change
            </button>
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => setReviewOpen(true)}
            aria-label="Review staged change"
            className="inbox-action inbox-action--approve"
          >
            <Eye size={13} strokeWidth={LINE_ICON_STROKE} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void revoke()}
            aria-label="Reject staged change"
            className="inbox-action inbox-action--reject"
          >
            <X size={13} strokeWidth={LINE_ICON_STROKE} />
          </button>
        </div>
      </div>
      {error ? (
        <Text variant="meta" tone="danger" as="p" className="mt-1 block">
          {error}
        </Text>
      ) : null}
      <StagedChangeReviewModal
        staged={staged}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        controls={controls}
      />
    </div>
  );
}

function notifyGraphChanged() {
  window.dispatchEvent(new Event('integral:graph-changed'));
}

/**
 * A scheduled routine with Pause / Resume / Stop / Remove in place.
 *
 * Pause skips future runs (current run continues). Stop soft-cancels and
 * aborts an in-flight scheduled turn. Remove hard-deletes the node.
 */
export function ScheduledRow({
  routine,
  onResolved,
}: {
  routine: RoutineResponse;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canPause = routine.status === 'active';
  const canResume =
    routine.status === 'paused' || routine.status === 'completed';
  const canStop =
    routine.status === 'active' || routine.status === 'paused';
  const canRemove = routine.status !== 'cancelled';

  const afterChange = () => {
    notifyGraphChanged();
    onResolved();
  };

  const handlePauseResume = async () => {
    if (busy) return;
    const next = canPause ? 'paused' : 'active';
    setBusy(true);
    setError(null);
    try {
      await updateRoutine(routine.id, { status: next });
      afterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (busy || !canStop) return;
    const ok = window.confirm(
      'Stop this scheduled task? A run in progress will be cancelled, and it will not run again.',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await cancelRoutine(routine.id);
      afterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop task');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (busy || !canRemove) return;
    const ok = window.confirm(
      'Remove this task permanently? This cannot be undone.',
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteRoutine(routine.id);
      afterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove task');
    } finally {
      setBusy(false);
    }
  };

  const metaParts: string[] = [String(routine.status)];
  if (routine.running) {
    metaParts.push('running now');
  } else if (routine.next_run_at && routine.status === 'active') {
    metaParts.push(`next ${formatRelativeTime(routine.next_run_at)}`);
  }

  return (
    <div className="inbox-row rounded-[var(--radius-input)] px-2.5 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Text variant="body-sm" as="p" className="block truncate">
            {routine.instruction}
          </Text>
          <Text variant="meta" tone="muted" as="p" className="block">
            <Clock
              size={10}
              strokeWidth={LINE_ICON_STROKE}
              className="mr-1 inline"
              aria-hidden
            />
            {metaParts.join(' · ')}
          </Text>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {canPause ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handlePauseResume()}
              aria-label="Pause scheduled task"
              className="inbox-action"
            >
              <Pause size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
          ) : null}
          {canResume ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handlePauseResume()}
              aria-label="Resume scheduled task"
              className="inbox-action"
            >
              <Play size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
          ) : null}
          {canStop ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleStop()}
              aria-label="Stop scheduled task"
              className="inbox-action inbox-action--reject"
            >
              <Square size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
          ) : null}
          {canRemove ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleRemove()}
              aria-label="Remove scheduled task"
              className="inbox-action inbox-action--reject"
            >
              <Trash2 size={13} strokeWidth={LINE_ICON_STROKE} />
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <Text variant="meta" tone="danger" as="p" className="mt-1 block">
          {error}
        </Text>
      ) : null}
    </div>
  );
}
