import { ExpandableChatError } from "../components/ExpandableChatError";
/**
 * Approval card for an agent-staged write.
 *
 * Renders in place of the default raw-JSON tool-call disclosure when a
 * tool-call result matches the StagedChange shape. User actions:
 * Approve this change / Show raw / Reject. On
 * Approve, then starts a host-side continuation so the agent re-enters the
 * loop with a now-blessed token without fabricating a user utterance.
 *
 * State management is local to the card — the source of truth lives in
 * the backend token store. Optimistic updates on click; if the server
 * rejects (token expired, unknown, etc.), we surface that inline.
 */

import { CheckIcon, ChevronDown, FileWarning, Sparkles, Undo2Icon, X } from 'lucide-react';
import { useState } from 'react';
import { useThreadRuntime } from '@assistant-ui/react';
import { ApprovalRequestContent } from './ApprovalRequestContent';
import { useConfirm } from '../../../context/ConfirmContext';
import type { StagedChange, StagedChangeState } from './types';
import { useStagedChange } from './useStagedChange';
import {
  StagedChangeReviewModal,
  isLargeStagedDiff,
} from './StagedChangeReviewModal';
import { Text } from '../../../ui';
import { describeConsumed } from './consumedSummary';
import { EditEntryProposal } from './EditEntryProposal';

export interface StagedChangeCardProps {
  staged: StagedChange;
  /**
   * Optional callback fired when the card has reached a terminal state
   * (consumed / revoked / expired) so a parent surface can remove it
   * from its list. The card itself does not unmount; the parent decides
   * when. Inline tool-call renders ignore this — the card stays in the
   * assistant message bubble as part of the historical record.
   */
  onTerminal?: (token: string) => void;
}

export function StagedChangeCard({ staged, onTerminal }: StagedChangeCardProps) {
  const [revision, setRevision] = useState<{ base: string; staged: StagedChange } | null>(null);
  const effective = revision?.base === staged.token ? revision.staged : staged;
  return <StagedChangeCardBody key={effective.token} staged={effective} onTerminal={onTerminal} onRevised={next => setRevision({ base: staged.token, staged: next })} />;
}

function StagedChangeCardBody({ staged, onTerminal, onRevised }: StagedChangeCardProps & { onRevised: (next: StagedChange) => void }) {
  const [showRaw, setShowRaw] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const confirm = useConfirm();


  // The thread runtime is what makes this surface able to nudge the agent
  // when a bless lands but no write ran. A list row has no conversation to
  // nudge, which is why the nudge is a caller-supplied callback rather than
  // something the hook does on its own.
  const threadRuntime = useThreadRuntime();
  const isLarge = isLargeStagedDiff(staged);

  const controls = useStagedChange(staged, {
    onTerminal,
    onNeedsStrongConfirmation: (summary) =>
      confirm({
        title: 'Confirm high-impact change',
        message: `This is a high-impact change. Review the affected records, access, or structure, then confirm this exact action: ${summary}`,
        confirmLabel: 'Confirm change',
        variant: 'danger',
      }),
    onNeedsAgentNudge: (hostAction) => {
      try {
        if (!threadRuntime) return;
        const messages = threadRuntime.getState().messages;
        const parentId = messages[messages.length - 1]?.id ?? null;
        threadRuntime.startRun({
          parentId,
          sourceId: null,
          runConfig: { custom: { hostAction } },
        });
      } catch {
        /* non-fatal — server-side state is correct */
      }
    },
  });
  const { status, consumedNav, isTerminal, isBlessed, bless, revoke, rollback } =
    controls;
  const executionFailed = isBlessed && status.kind === 'error';

  // Confirmation is presentation, so it stays here rather than in the hook:
  // a list row may want different phrasing, or none at all.
  const handlePostConsumeRollback = async () => {
    if (!rollback.available || rollback.loading) return;
    const ok = await confirm({
      title: 'Undo agent change?',
      message: `This will reverse the changes from "${staged.summary}".`,
      confirmLabel: 'Undo changes',
      variant: 'danger',
    });
    if (!ok) return;
    await rollback.execute();
  };

  // ───────────────────────────────────────── Card chrome
  return (
    <div
      className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--panel)] px-3 py-2.5"
      data-staged-token={staged.token}
      data-staged-state={status.state}
    >
      <StagedChangeReviewModal
        staged={staged}
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        controls={controls}
        onRevised={onRevised}
      />
      {/* Header — title on the left (may wrap to 2 lines), status pill pinned
          top-right and NEVER wrapping. items-start keeps the pill on the first
          line when the title spills over. */}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <Sparkles
            size={13}
            className="mt-px shrink-0 text-[var(--brand-accent)]"
          />
          <Text variant="label" tone="default" className="min-w-0 leading-snug">
            {status.state === 'pending' ? 'Allow this change?' : staged.summary}
          </Text>
        </div>
        <StateBadge
          state={status.state}
          autonomyUsed={staged.autonomy_grant_used}
          executionFailed={executionFailed}
        />
      </div>

      {status.state === 'pending' && staged.effect_class ? (
        <Text
          variant="meta"
          tone={
            staged.effect_class === 'destructive_security'
              ? 'danger'
              : staged.effect_class === 'material_external'
                ? 'muted'
                : 'default'
          }
          className="mb-2 block"
        >
          {staged.effect_class === 'destructive_security'
            ? 'High impact · requires deliberate confirmation'
            : staged.effect_class === 'material_external'
              ? 'Material action · review the destination and effects'
              : 'Private workspace change'}
        </Text>
      ) : null}

      {!isTerminal && (
        <div className="mb-4 max-h-80 overflow-auto overscroll-contain">
          <ApprovalRequestContent staged={staged} />
          {isLarge ? <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="mt-3 text-[var(--link)] hover:underline"
          >
            <Text variant="body-sm" as="span">Review full change →</Text>
          </button> : null}
        </div>
      )}

      {/* Raw disclosure — only for small changes; large ones get the viewer
          in the modal rather than a JSON dump squeezed into the column. */}
      {!isTerminal && !isLarge && (
        <button
          onClick={() => setShowRaw((v) => !v)}
          className="mb-2 flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--text-subtle)] hover:text-[var(--text-muted)]"
        >
          <ChevronDown
            size={10}
            className={`transition-transform ${showRaw ? '' : '-rotate-90'}`}
          />
          {showRaw ? 'Hide technical details' : 'Technical details'}
        </button>
      )}
      {showRaw && !isTerminal && (
        <pre className="mb-2 overflow-x-auto rounded-[var(--radius-input)] bg-[var(--panel-2)] p-2 text-[11px] leading-4 text-[var(--text-muted)]">
          {JSON.stringify(staged.diff_machine, null, 2)}
        </pre>
      )}

      {status.state === 'pending' && (
        <div className="flex flex-wrap items-center gap-2">
          {staged.can_edit_entries ? <EditEntryProposal token={staged.token} disabled={status.kind === 'loading'} onRevised={onRevised} /> : null}
          <button
            onClick={() => bless()}
            disabled={status.kind === 'loading'}
            className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--brand-accent)] px-3 py-1 text-xs font-medium text-[var(--brand-accent-fg)] hover:opacity-90 disabled:opacity-50"
          >
            <CheckIcon size={12} /> Approve
          </button>
          <button
            onClick={() => void revoke()}
            disabled={status.kind === 'loading'}
            className="ml-auto inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-3 py-1 text-xs text-[var(--text-subtle)] hover:text-[var(--danger-fg)]"
          >
            <X size={12} /> Reject
          </button>
        </div>
      )}

      {/* Approval authorizes an attempt; it does not establish completion or
          safe retry. Cancellation revokes the remaining approval, not any
          partial effects the server may have recorded. */}
      {isBlessed && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            {executionFailed ? <FileWarning size={12} className="text-[var(--danger-fg)]" /> : <CheckIcon size={12} className="text-[var(--success-fg)]" />}
            {executionFailed
              ? 'Could not apply this authorized change.'
              : staged.autonomy_grant_used
                ? 'Auto-approved (session grant).'
                : 'Approved — not yet applied.'}
          </span>
          <button
            type="button"
            onClick={() => void revoke()}
            disabled={status.kind === 'loading'}
            className="text-[var(--text-subtle)] hover:text-[var(--danger-fg)] disabled:opacity-50"
          >
            Cancel approval
          </button>
        </div>
      )}

      {status.state === 'consumed' && (
        <div className="flex flex-col gap-2">
          <div
            className="
              flex items-center gap-2.5
              rounded-[var(--radius-input)]
              border border-[var(--success-fg)]/30
              bg-[var(--success-bg)]
              px-3 py-2
              text-[15px] font-medium text-[var(--text)]
              animate-in fade-in zoom-in-95 duration-200
            "
          >
            <span
              className="
                inline-flex h-6 w-6 shrink-0 items-center justify-center
                rounded-full bg-[var(--success-fg)] text-white
              "
              aria-hidden
            >
              <CheckIcon size={14} strokeWidth={3} />
            </span>
            <span>{describeConsumed(staged, consumedNav)}</span>
          </div>
          {!rollback.done && (
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={() => void handlePostConsumeRollback()}
                disabled={!rollback.available || rollback.loading}
                title={
                  rollback.available
                    ? 'Undo agent changes'
                    : (rollback.reason ?? 'Undo unavailable')
                }
                className="
                  inline-flex items-center gap-1 rounded-[var(--radius-pill)]
                  px-3 py-1 text-xs text-[var(--text-subtle)]
                  hover:text-[var(--danger-fg)]
                  disabled:cursor-not-allowed disabled:opacity-40
                "
              >
                <Undo2Icon size={12} /> Undo
              </button>
            </div>
          )}
          {rollback.done && (
            <div className="text-xs text-[var(--text-subtle)]">
              Changes undone.
            </div>
          )}
        </div>
      )}

      {status.state === 'revoked' && (
        <div className="flex items-center gap-1 text-xs text-[var(--text-subtle)]">
          <X size={12} /> {staged.superseded_by ? 'Replaced by your edited proposal.' : 'Rejected.'}
        </div>
      )}

      {status.state === 'expired' && (
        <div className="flex items-center gap-1 text-xs text-[var(--text-subtle)]">
          <FileWarning size={12} /> Expired.
        </div>
      )}

      {status.kind === 'error' && (
        <div className="mt-2 rounded-[var(--radius-input)] bg-[var(--danger-bg)] px-2 py-1 text-xs text-[var(--danger-fg)]">
          <ExpandableChatError summary={status.message} />
        </div>
      )}
    </div>
  );
}

/**
 * Compact status pill: a tinted dot + a short sentence-case label in a
 * rounded chip. ``whitespace-nowrap`` + ``shrink-0`` guarantee it never wraps
 * (the old uppercase "AWAITING APPROVAL" wrapped to two lines when the title
 * was long). Colour is driven by a single per-state token pair applied inline,
 * so the dot and text always share the state's hue.
 */
function StateBadge({
  state,
  autonomyUsed,
  executionFailed,
}: {
  state: StagedChangeState;
  autonomyUsed: boolean;
  executionFailed: boolean;
}) {
  const { label, fg, bg } = ((): {
    label: string;
    fg: string;
    bg: string;
  } => {
    if (executionFailed) {
      return { label: 'Failed', fg: 'var(--danger-fg)', bg: 'var(--danger-bg)' };
    }
    switch (state) {
      case 'pending':
        return {
          label: autonomyUsed ? 'Auto-pending' : 'Awaiting approval',
          fg: 'var(--ai-fg)',
          bg: 'var(--ai-bg)',
        };
      case 'blessed':
        return { label: 'Approved', fg: 'var(--success-fg)', bg: 'var(--success-bg)' };
      case 'consumed':
        return { label: 'Done', fg: 'var(--success-fg)', bg: 'var(--success-bg)' };
      case 'revoked':
        return { label: 'Rejected', fg: 'var(--danger-fg)', bg: 'var(--danger-bg)' };
      case 'expired':
        return { label: 'Expired', fg: 'var(--text-subtle)', bg: 'var(--panel-2)' };
      default:
        return { label: state, fg: 'var(--text-subtle)', bg: 'var(--panel-2)' };
    }
  })();
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ color: fg, backgroundColor: bg }}
    >
      <span
        className="size-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: fg }}
        aria-hidden
      />
      {label}
    </span>
  );
}
