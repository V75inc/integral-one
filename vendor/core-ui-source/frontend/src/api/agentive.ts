import type { StagedChange } from '../features/ai-chat/staging/types';
import api from './client';
import type { ConversationContext } from '../types/conversationContext';
import type { ChatEntityRef } from '../types/chatEntityRefs';

// ── Agentive Status ────────────────────────────────────────

export interface AgentiveStatus {
  enabled: boolean;
  agent_connected: boolean;
  agent_key_mode?: string;
  reason?: string;
  agent_config?: {
    scope: string;
    agent_type: string;
    capabilities: string[];
    conversation_endpoint: string;
  };
}

export async function getAgentiveStatus(): Promise<AgentiveStatus> {
  const res = await api.get('/agentive/status');
  return res.data;
}

// ── Chat (typed boundary mirroring backend Pydantic models) ────

/** Canonical agent-kind enum. Mirrors `backend/app/agentive/types.py::AgentType`
 *  (Literal["integral_native","mcp","skill_bundle","custom"]) per D-09. */
export type AgentType = 'integral_native' | 'mcp' | 'skill_bundle' | 'custom';

/** Vendor-neutral chat-turn request. `email` is NEVER on this body — it comes from
 *  the authenticated session server-side. Client-supplied user identifiers are ignored. */
export interface ChatTurnRequest {
  /** User utterance (UTF-8). Backend enforces 1..8000 chars; frontend trims + pre-validates non-empty. */
  message: string;
  /** Opaque session id from a prior turn. Backend allows ≤128 chars. */
  session_id?: string;
  /** Track the user is currently viewing. Optional. */
  focused_track_id?: string;
  /** App the user is currently viewing. Optional. */
  focused_space_id?: string;
  /** Picker-selected @ / # entity references for agent context. */
  entity_refs?: ChatEntityRef[];
}

/** Vendor-neutral chat-turn response.
 *
 *  RESERVED FOR PHASE 6 (BYOA-AWARE UI): `agent_type` echoes which connector handled
 *  the turn. Phase 1 stores it on the message for telemetry; Phase 6 surfaces it in
 *  the UI ("via native provider" / "via mcp"). */
export interface ChatTurnResponse {
  ok: boolean;
  message: string;
  session_id: string;
  agent_user_id: string;
  /** Which connector handled the turn — observability for the host, surface in Phase 6. */
  agent_type: AgentType;
  /** Connector-side error message. Present iff ok=false. */
  error?: string;
}

/** Canonical error envelope returned by every agentive error path (D-03).
 *  Phase 1 commits to full backend rollout, so the frontend handles ONE shape only. */
export interface AgentiveErrorEnvelope {
  /** Stable machine-readable code (e.g., "agentive.auth.signature_required",
   *  "VALIDATION_ERROR"). NOT shown to end users. */
  error_code: string;
  /** Human-readable message — THE ONLY field rendered to end users. */
  message: string;
  /** Per-error structured details (e.g., Pydantic validation errors[]). Dev-tools only. */
  details: unknown;
  /** ISO-8601 UTC timestamp. */
  timestamp: string;
  /** Request URL path. */
  path: string;
}

/** In-app chat via Integral proxy (JWT); email is taken from the session server-side. */
export async function postAgentiveChatMessage(
  params: ChatTurnRequest,
): Promise<ChatTurnResponse> {
  const res = await api.post('/agentive/chat/message', params);
  return res.data;
}

// ── MCP Tools ──────────────────────────────────────────────

export async function listMcpTools() {
  const res = await api.get('/agentive/tools');
  return res.data;
}

export async function executeMcpTool(toolName: string, parameters: Record<string, unknown>) {
  const res = await api.post(`/agentive/tools/${toolName}`, { parameters });
  return res.data;
}

// ── Skills ─────────────────────────────────────────────────

export async function listSkills() {
  const res = await api.get('/agentive/skills');
  return res.data;
}

// ── Staging (confirmation tokens for agent writes) ─────────
//
// Every agent-initiated write is gated by a token minted via prepare_X
// and consumed by execute_X. The frontend approval card calls these
// endpoints when the user clicks Approve / Reject. See
// `.planning/agentive/staging-primitive.md` for the full flow.

export interface StagingResponse {
  ok: boolean;
  /**
   * The canonical `StagedChange` from `features/ai-chat/staging/types`.
   *
   * This used to be an inline structural copy that had drifted from it —
   * weaker (`state: string` instead of the `StagedChangeState` union) and
   * missing fields the real payload carries. Two definitions of one wire
   * shape meant a consumer typed against this one could not be handed to
   * code expecting the other. Type-only import, so no runtime coupling.
   */
  staged_change?: StagedChange;
  /**
   * Present iff the backend's `staging_executors` module is loaded
   * and dispatched the write automatically on bless. Frontend uses
   * absence of this field as the signal to run the client-side
   * write-fallback path (see `features/ai-chat/staging/writeFallback.ts`).
   */
  execute_result?: Record<string, unknown> & { error?: boolean; message?: string };
  consume_warning?: { error_code: string; message: string };
  consumed?: boolean;
  error_code?: string;
  message?: string;
}

/**
 * All non-terminal staged changes for the authenticated user, across every
 * chat session. Powers the Approvals page's "Agent chat approvals" section
 * so a pending card in chat is never invisible from /approvals (June 30
 * review R3 — the two approval surfaces previously didn't see each other).
 */
export async function listPendingStagedChanges(): Promise<
  NonNullable<StagingResponse['staged_change']>[]
> {
  const res = await api.get('/agentive/staging/pending');
  const items = res.data?.pending;
  return Array.isArray(items) ? items : [];
}

export async function blessStagingToken(
  token: string,
  options: { strongConfirmation?: boolean } = {},
): Promise<StagingResponse> {
  const res = await api.post('/agentive/staging/bless-token', {
    token,
    strong_confirmation: Boolean(options.strongConfirmation),
  });
  return res.data;
}

export async function revokeStagingToken(token: string): Promise<StagingResponse> {
  const res = await api.post('/agentive/staging/revoke-token', { token });
  return res.data;
}

export interface RollbackStatusResponse {
  ok: boolean;
  staging_token?: string;
  available?: boolean;
  reason?: string;
  message?: string;
  event_count?: number;
  actions?: string[];
  rolled_back_at?: string;
  error_code?: string;
}

export interface RollbackTokenResponse {
  ok: boolean;
  staging_token?: string;
  inverted?: Array<Record<string, unknown>>;
  rollback_event_ids?: string[];
  rolled_back_at?: string;
  error_code?: string;
  message?: string;
}

export async function getStagingRollbackStatus(
  token: string,
): Promise<RollbackStatusResponse> {
  const res = await api.get(
    `/agentive/staging/rollback-status/${encodeURIComponent(token)}`,
  );
  return res.data;
}

export async function rollbackStagingToken(
  token: string,
  force = false,
): Promise<RollbackTokenResponse> {
  const res = await api.post('/agentive/staging/rollback-token', { token, force });
  return res.data;
}

/**
 * Fetch the CURRENT state of one staged-change token. Used by the
 * inline ``StagedChangeCard`` on mount to reconcile its visible
 * state against the backend — the persisted tool-call result is a
 * snapshot from mint time (always ``pending``) and won't reflect
 * any subsequent bless/consume/revoke, so without this the card
 * would revert to "AWAITING APPROVAL" every time the user
 * navigates back to the chat.
 *
 * Returns the staged change or null on unknown_token (e.g. the
 * backend swept the token after consume; callers should fall back
 * to the staged.state from the message context — most often that
 * means the card was consumed and we render the terminal state).
 */
export async function getStagingTokenState(
  token: string,
): Promise<NonNullable<StagingResponse['staged_change']> | null> {
  try {
    const res = await api.get(`/agentive/staging/token/${encodeURIComponent(token)}`);
    if (res.data?.ok && res.data?.staged_change) {
      return res.data.staged_change;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Smart Filing ───────────────────────────────────────────

export async function smartFileCreateEntry(params: {
  text: string;
  track_id?: string;
  entry_type_id?: string;
  fields?: Record<string, unknown>;
  tags?: string[];
  track_hint?: string;
  type_hint?: string;
  focused_track_id?: string;
}) {
  const res = await api.post('/agentive/smart-file/create-entry', params);
  return res.data;
}

// ── Conversation Context ──────────────────────────────────

export async function createConversationContext(data: Partial<ConversationContext> & {
  agent_type?: string;
  agent_conversation_id?: string;
  scope?: string;
  persona?: string;
  workspace_id?: string;
}) {
  const res = await api.post('/agentive/conversations/context', data);
  return res.data;
}

export async function getConversationContext(id: string) {
  const res = await api.get(`/agentive/conversations/context/${id}`);
  return res.data;
}

export async function updateConversationContext(id: string, data: Partial<ConversationContext>) {
  const res = await api.patch(`/agentive/conversations/context/${id}`, data);
  return res.data;
}

export async function deleteConversationContext(id: string) {
  const res = await api.delete(`/agentive/conversations/context/${id}`);
  return res.data;
}

// ── Channel Identities ────────────────────────────────────

export async function linkChannelIdentity(data: {
  channel: string;
  channel_user_id: string;
  preferences?: Record<string, unknown>;
}) {
  const res = await api.post('/agentive/channels/identities', data);
  return res.data;
}

export async function listChannelIdentities() {
  const res = await api.get('/agentive/channels/identities');
  return res.data;
}

export async function unlinkChannelIdentity(id: string) {
  const res = await api.delete(`/agentive/channels/identities/${id}`);
  return res.data;
}

export async function verifyChannelIdentity(id: string) {
  const res = await api.post(`/agentive/channels/identities/${id}/verify`);
  return res.data;
}

// ── Channel Identity — WhatsApp Verification ─────────────

export async function resolveChannelIdentity(channel: string, channelUserId: string, workspaceId?: string) {
  const res = await api.post('/agentive/channels/identities/resolve', {
    channel,
    channel_user_id: channelUserId,
    workspace_id: workspaceId,
  });
  return res.data;
}

export async function initiateWhatsAppVerification(phone: string) {
  const res = await api.post('/agentive/channels/whatsapp/verify-initiate', { phone });
  return res.data;
}

export async function verifyWhatsAppOtp(phone: string, otpCode: string) {
  const res = await api.post('/agentive/channels/whatsapp/verify-otp', {
    phone,
    otp_code: otpCode,
  });
  return res.data;
}

export async function verifyLinkToken(identityId: string, token: string) {
  const res = await api.post(`/agentive/channels/identities/${identityId}/verify-link-token`, {
    token,
  });
  return res.data;
}

// ── Proactive ─────────────────────────────────────────────

export async function getDigest() {
  const res = await api.get('/agentive/proactive/digest');
  return res.data;
}

export async function getReminders() {
  const res = await api.get('/agentive/proactive/reminders');
  return res.data;
}

export async function updateProactivePreferences(prefs: Record<string, unknown>) {
  const res = await api.patch('/agentive/proactive/preferences', prefs);
  return res.data;
}
// ── Clarifying questions ──────────────────────────────────

export interface PendingUserQuestion {
  question_id: string;
  question: string;
  options: { label: string; description?: string }[];
  header?: string;
  multi_select?: boolean;
  asked_at_user_turn?: number;
  asked_at?: string;
}

/**
 * Record the user's answer to a resident clarifying question.
 *
 * Clears the thread marker; it does NOT deliver the answer to the model —
 * the card appends the pick as a normal chat message for that, the same
 * resume path the staged-change card uses.
 */
export async function answerUserQuestion(params: {
  threadId: string;
  questionId: string;
  choices: string[];
  freeText?: string;
}): Promise<{ ok: boolean; cleared?: boolean; error_code?: string }> {
  const res = await api.post('/agentive/questions/answer', {
    thread_id: params.threadId,
    question_id: params.questionId,
    choices: params.choices,
    free_text: params.freeText ?? '',
  });
  return res.data;
}

/**
 * The thread's currently-pending question, or null.
 *
 * Lets a card reconcile on remount rather than trusting the persisted
 * tool-call result, which captured the state at ask time (always `pending`)
 * and goes stale the moment the user answers.
 */
export async function getPendingUserQuestion(
  threadId: string,
): Promise<PendingUserQuestion | null> {
  try {
    const res = await api.get('/agentive/questions/pending', {
      params: { thread_id: threadId },
    });
    return res.data?.ok ? (res.data.pending ?? null) : null;
  } catch {
    return null;
  }
}

// ── Prompt Sheet queue ────────────────────────────────────

export interface PromptQueueResponse {
  error?: string;
  detail?: string;
  ok: boolean;
  open: boolean;
  queue: {
    status: string;
    items: Array<Record<string, unknown>>;
  };
  resume_text?: string | null;
  resume_required?: boolean;
  closed?: boolean;
}

export async function getPromptQueue(
  threadId: string,
): Promise<PromptQueueResponse> {
  const res = await api.get('/agentive/prompt-queue', {
    params: { thread_id: threadId },
  });
  if (!res.data?.ok) throw new Error('Approval state could not be verified.');
  return res.data;
}

export async function resolvePromptQuestion(params: {
  threadId: string;
  itemId: string;
  choices?: string[];
  freeText?: string;
  skip?: boolean;
}): Promise<PromptQueueResponse> {
  const res = await api.post('/agentive/prompt-queue/resolve-question', {
    thread_id: params.threadId,
    item_id: params.itemId,
    choices: params.choices ?? [],
    free_text: params.freeText ?? '',
    skip: Boolean(params.skip),
  });
  return res.data;
}

export async function markPromptWrite(params: {
  threadId: string;
  token: string;
  status: 'approved' | 'rejected';
}): Promise<PromptQueueResponse> {
  const res = await api.post('/agentive/prompt-queue/mark-write', {
    thread_id: params.threadId,
    token: params.token,
    status: params.status,
  });
  return res.data;
}

export async function cancelPromptQueueAll(
  threadId: string,
): Promise<PromptQueueResponse> {
  const res = await api.post('/agentive/prompt-queue/cancel-all', {
    thread_id: threadId,
  });
  return res.data;
}
