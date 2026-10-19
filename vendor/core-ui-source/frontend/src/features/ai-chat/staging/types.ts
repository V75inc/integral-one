/**
 * Frontend mirror of the backend ``StagedChange`` shape.
 *
 * The backend mints these as the return value of any ``prepare_X`` skill;
 * the chat surface detects them in tool-call results and renders an
 * approval card in place of the raw JSON disclosure. Approving / rejecting
 * the card calls ``/api/agentive/staging/bless-token`` (or revoke).
 *
 * Source of truth: ``backend/app/agentive/staging.py::StagedChange.to_dict``
 * and ``.planning/agentive/staging-primitive.md``. Keys are stable —
 * coordinate any rename across both sides.
 */

import type { ConsumedNav } from './consumedSummary';

export type StagedChangeState =
  | 'pending'
  | 'blessed'
  | 'consumed'
  | 'revoked'
  | 'expired';

export interface StagedChange {
  /** Sentinel — what the type guard checks on. Always literal "staged_change". */
  _kind: 'staged_change';
  /** Opaque token. The agent passes this to execute_X; the frontend passes it to bless/revoke. */
  token: string;
  /**
   * Conversation/session this token was minted in. Carried through
   * for future per-thread scoping; the current inline rendering path
   * is already thread-scoped by virtue of cards living in the
   * message bubble. Nullable for tokens minted outside any chat
   * session (rare edge case — older minting paths).
   */
  session_id?: string | null;
  /** Verb_noun[.subaction] — the type of change proposed for approval. */
  kind: string;
  /** Server-classified impact tier; never inferred from assistant prose. */
  effect_class?: 'private_reversible' | 'material_external' | 'destructive_security';
  /** High-impact classes must use the deliberate confirmation control. */
  requires_strong_confirmation?: boolean;
  /** How the decision was recorded, when a decision has been made. */
  decision_source?: string | null;
  /** One-sentence agent-narrated headline (e.g., "Create entry “Foo” in Marketing"). */
  summary: string;
  /** Markdown body for the approval card. */
  diff_human: string;
  /** Structured diff for the raw view + future audit log. */
  diff_machine: Record<string, unknown>;
  state: StagedChangeState;
  /**
   * Why an approved write did not land, when it did not.
   *
   * Recorded on the change by the backend rather than returned only to
   * whoever clicked Approve — that is what lets a surface which learned the
   * state from the WS push or a reload explain it instead of just saying
   * "approved, not yet applied".
   */
  last_error?: {
    message?: string;
    error_code?: string | null;
    status_code?: number | null;
  } | null;
  /** ISO-8601 UTC. */
  created_at: string;
  /** ISO-8601 UTC; default 600s after created_at. */
  expires_at: string;
  /** Legacy response field; new V1 changes always require one-time approval. */
  autonomy_grant_used: boolean;
  /**
   * Navigable resource ids from a successful consume — persisted server-side
   * so approval-card links survive chat reload.
   */
  consumed_nav?: ConsumedNav;
  /** Executor payload persisted at consume time (for rollback UX). */
  execute_result?: Record<string, unknown>;
  /** ISO timestamp when this change was rolled back post-consume. */
  rolled_back_at?: string;
  /** ChangeEvent ids emitted by the rollback engine. */
  rollback_event_ids?: string[];
}

/**
 * Type guard for tool-call results. The chat surface calls this on every
 * tool-call ``result`` to decide whether to render a StagedChangeCard or
 * the default raw-JSON disclosure.
 *
 * Be conservative — false positives would break unrelated tool outputs.
 * The ``_kind === 'staged_change'`` sentinel is authoritative; the rest
 * of the checks are defense-in-depth against future API drift.
 */
export function isStagedChange(result: unknown): result is StagedChange {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  if (r._kind !== 'staged_change') return false;
  return (
    typeof r.token === 'string' &&
    typeof r.kind === 'string' &&
    typeof r.summary === 'string' &&
    typeof r.diff_human === 'string' &&
    typeof r.state === 'string'
  );
}

/** Approval mode accepted by V1. */
export type BlessAutonomy = 'single';
