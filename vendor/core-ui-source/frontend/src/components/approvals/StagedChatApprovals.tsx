import { useSingleFlight } from '../../hooks/useSingleFlight';
import { useSerialPolling } from '../../hooks/useSerialPolling';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Eye, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { discardDesign, listDesignDecisions, type DesignDecision } from '../../api/designDecisions';
import { useScopeOptional } from '../../context/ScopeContext';
import { LINE_ICON_STROKE } from '../ui';
import { Text } from '../../ui';
import { formatRelativeTime } from '../../utils';
import { listPendingStagedChanges } from '../../api/agentive';
import { useStagedChange } from '../../features/ai-chat/staging/useStagedChange';
import { StagedChangeReviewModal } from '../../features/ai-chat/staging/StagedChangeReviewModal';
import { useConfirm } from '../../context/ConfirmContext';

import type { StagedChange } from '../../features/ai-chat/staging/types';

/**
 * Pending agent-chat staged changes, surfaced on the Approvals page.
 *
 * A staged change awaiting approval used to be visible ONLY as the inline
 * card inside the chat conversation that minted it — this page said
 * "All clear" at the same moment a card sat AWAITING APPROVAL in chat
 * (June 30 review R3). Approve/Reject here reuse the exact bless/revoke
 * endpoints the chat card calls, so the inline card reconciles to the
 * terminal state on its next mount.
 */
/** Bounded proposal collection shared by the full page and global Inbox. */
export function useStagedApprovals() {
  const workspaceId = useScopeOptional()?.scope?.workspaceId;
  const requestRevision = useRef(0);
  const [designs, setDesigns] = useState<DesignDecision[]>([]);
  const [rows, setRows] = useState<StagedChange[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);

  const refetch = useSingleFlight(useCallback(async () => {
    const revision = ++requestRevision.current;
    try {
      const [pending, savedDesigns] = await Promise.all([listPendingStagedChanges(), listDesignDecisions()]);
      if (revision !== requestRevision.current) return;
      setDesigns(savedDesigns);
      // design_proposal is confirmed in chat, not via Approvals Approve —
      // showing it here collapsed design confirm into a bless dialog.
      setRows(
        pending.filter(
          (sc) => (sc.state === 'pending' || sc.state === 'blessed') && sc.kind !== 'design_proposal',
        ),
      );
      setRefreshFailed(false);
    } catch {
      if (revision !== requestRevision.current) return;
      // Preserve known proposals; a failed refresh is not an "all clear".
      setRefreshFailed(true);
    } finally {
      if (revision === requestRevision.current) setLoaded(true);
    }
  }, [workspaceId]));

  useEffect(() => {
    setRows([]);
    setDesigns([]);
    setLoaded(false);
    void refetch();
    // External MCP proposals have no local chat event. Refresh boundedly and
    // on the events shared by chat/Inbox so this page does not require reload.
    const refresh = () => void refetch();
    window.addEventListener('focus', refresh);
    window.addEventListener('integral:staging-created', refresh);
    window.addEventListener('integral:staging-state-changed', refresh);
    return () => {
      ++requestRevision.current;
      window.removeEventListener('focus', refresh);
      window.removeEventListener('integral:staging-created', refresh);
      window.removeEventListener('integral:staging-state-changed', refresh);
    };
  }, [refetch]);

  useSerialPolling(refetch, 15_000);

  return { rows, designs, count: rows.length + designs.length, loaded, refreshFailed, refetch };
}

export function StagedChatApprovals({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const collection = useStagedApprovals();
  useEffect(() => {
    if (collection.loaded) onCountChange?.(collection.count);
  }, [collection.loaded, collection.count, onCountChange]);
  return <StagedApprovalsList {...collection} />;
}

export function StagedApprovalsList({
  rows, designs, loaded, refreshFailed, refetch,
}: ReturnType<typeof useStagedApprovals>) {
  if (!loaded || (rows.length === 0 && designs.length === 0 && !refreshFailed)) return null;

  return (
    <section aria-label="Proposed changes" className="mt-8">
      <Text as="h2" variant="body-sm" tone="muted" weight="medium" className="mb-3 block">
        Proposed changes
        <Text as="span" variant="body-sm" tone="subtle" className="ml-2">
          review the details before authorizing a change
        </Text>
      </Text>
      {refreshFailed && (
        <div role="status">
          <Text as="p" variant="body-sm" tone="warn" className="mb-3 block">
            Proposed changes could not be refreshed.{' '}
            <button type="button" onClick={() => void refetch()} className="underline">Retry</button>
          </Text>
        </div>
      )}
      <div className="space-y-2">
        {designs.map(design => (
          <DesignDecisionRow key={`${design.thread_id}:${design.proposed_at}`} design={design} onDecide={refetch} />
        ))}
        {rows.map(sc => (
          <StagedChangeRow key={sc.token} staged={sc} onDecide={refetch} />
        ))}
      </div>
    </section>
  );
}

function StagedChangeRow({
  staged,
  onDecide,
}: {
  staged: StagedChange;
  onDecide(): void;
}) {
  // Shares the chat card's state machine rather than reimplementing it.
  //
  // The reimplementation this replaces called `blessStagingToken` and
  // stopped, which was wrong in two ways: approving a kind the backend has
  // no executor for left the token blessed with the write never performed,
  // and a write that DID land was invisible until a manual refresh because
  // nothing invalidated the caches.
  //
  // No `onNeedsAgentNudge`: this surface has no conversation to nudge. When
  // a bless lands without a write, do not imply execution or retry is underway.
  const [reviewOpen, setReviewOpen] = useState(false);
  const confirm = useConfirm();
  const controls = useStagedChange(staged, {
    onTerminal: () => onDecide(),
    onNeedsStrongConfirmation: (summary) => confirm({
      title: 'Confirm high-impact change',
      message: `Review the affected records, access, or structure, then confirm this exact action: ${summary}`,
      confirmLabel: 'Confirm change',
      variant: 'danger',
    }),
  });
  const { busy, error, state, revoke } = controls;
  const approved = state === 'blessed';

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--panel-border)] bg-[var(--nav-active-bg)] p-4">
      <div
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--warn-fg)]"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <Text as="p" variant="body-sm" weight="medium" className="block">
          {staged.summary}
        </Text>
        <Text as="p" variant="meta" tone="muted" className="mt-0.5 block">
          {approved
            ? (error ? 'Approved · action incomplete' : 'Approved · not yet applied')
            : `Awaiting authorization · staged ${formatRelativeTime(staged.created_at)}`}
          <span className="mx-1.5" aria-hidden>
            ·
          </span>
          expires {formatRelativeTime(staged.expires_at).trim()}
          <span className="mx-1.5" aria-hidden>
            ·
          </span>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="inline-flex items-center gap-1 text-[var(--link)] hover:text-[var(--link-hover)] hover:underline"
          >
            <Eye size={11} strokeWidth={LINE_ICON_STROKE} />
            Review change
          </button>
        </Text>
        {error && (
          <div className="mt-2 rounded-[var(--radius-input)] border border-[color:var(--danger-fg)]/20 bg-[var(--danger-bg)] px-2 py-1 text-[11px] text-[var(--danger-fg)]">
            {error}
          </div>
        )}
      </div>
      {(state === 'pending' || approved) && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => setReviewOpen(true)}
            aria-label="Review staged change"
            className="rounded-lg p-1.5 text-[var(--success-fg)] transition-colors hover:bg-[var(--nav-active-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Eye size={14} strokeWidth={LINE_ICON_STROKE} />
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void revoke()}
            aria-label={approved ? 'Cancel approved change' : 'Reject staged change'}
            title={approved ? 'Cancel approval' : 'Reject change'}
            className="rounded-lg p-1.5 text-[var(--danger-fg)] transition-colors hover:bg-[var(--nav-active-bg)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X size={14} strokeWidth={LINE_ICON_STROKE} />
          </button>
        </div>
      )}
      <StagedChangeReviewModal
        staged={staged}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        controls={controls}
      />
    </div>
  );
}


function DesignDecisionRow({ design, onDecide }: { design: DesignDecision; onDecide(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const discard = async () => {
    if (!await confirm({
      title: 'Discard saved design?',
      message: `Discard “${design.summary}” revision ${design.blueprint_revision}? This retires the saved proposal. Existing records are preserved.`,
      confirmLabel: 'Discard design', variant: 'danger',
    })) return;
    setBusy(true);
    setError(null);
    try {
      await discardDesign(design);
      window.dispatchEvent(new Event('integral:staging-state-changed'));
      onDecide();
    } catch (err) {
      const response = (err as { response?: { data?: { message?: string; detail?: string } } }).response?.data;
      setError(response?.message || response?.detail || 'Could not discard this design. Open its conversation to review current work.');
    } finally { setBusy(false); }
  };
  return <div className="rounded-lg border border-[var(--panel-border)] bg-[var(--nav-active-bg)] p-4">
    <Text as="p" variant="body-sm" weight="medium" className="block">{design.summary}</Text>
    <Text as="p" variant="meta" tone="muted" className="mt-1 block">
      {design.partial_build ? 'Build needs reconciliation' : design.approved ? 'Design confirmed · build not completed' : 'Awaiting design confirmation'}
      {' · '}Revision {design.blueprint_revision}
    </Text>
    <Text as="p" variant="body-sm" tone="muted" className="mt-1 block">Review or resume in {design.thread_title || 'the original conversation'}. Confirming a design does not execute its changes.</Text>
    <div className="mt-2 flex items-center gap-4">
      <Link to={`/agent?thread=${encodeURIComponent(design.thread_id)}`} className="min-h-11 inline-flex items-center text-[var(--link)] hover:underline">Open design conversation</Link>
      {!design.partial_build && <button type="button" disabled={busy} onClick={() => void discard()} className="min-h-11 text-[var(--danger-fg)] hover:underline disabled:opacity-50">Discard design</button>}
    </div>
    {error && <div role="alert"><Text as="p" variant="body-sm" tone="danger" className="mt-2 block">{error}</Text></div>}
  </div>;
}
