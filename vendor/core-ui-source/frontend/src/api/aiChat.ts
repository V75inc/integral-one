import { apiClient } from './index';
import type { ChatEntityRef } from '../types/chatEntityRefs';

export interface MandateReviewSummary {
  work_item_id: string;
  goal: string;
  work_status: string;
}

export interface EntryReadMandateProposal {
  mandate_id: string;
  goal: string;
  entry_ids: string[];
  deadline_at: string;
  max_spend: string;
}

export interface ChatMandateReview {
  work_item_id: string;
  work_status: string;
  approval_status: string;
  review_digest: string;
  execution_enabled: boolean;
  cancel_requested?: boolean;
  requires_reconciliation?: boolean;
  accounting?: {
    status: 'not_recorded' | 'unavailable' | 'awaiting_receipt' | 'reserved' | 'settled' | 'overrun' | 'released';
    reserved_usd?: string | null;
    charged_usd?: string | null;
  } | null;
  entry_read_preflight: 'current' | 'denied' | 'unsupported';
  model_route_preflight: 'current' | 'stale' | 'unavailable';
  terms: {
    goal: string;
    revision: number;
    limits: {
      deadline_at: string;
      currency: string;
      max_spend: string;
      max_model_requests: number;
      max_tool_calls: number;
      max_internal_writes: number;
      max_external_effects: number;
    };
    grants: Array<{
      capability_key: string;
      capability_version: string;
      operation: string;
      max_calls: number;
      resources: Array<{ kind: string; resource_id: string }>;
    }>;
    external_grants: Array<{ capability_key: string; destination: string; max_effects: number }>;
    model_routes: Array<{ provider: string; model: string; credential_source: string }>;
    entry_source_revisions?: Array<{ entry_id: string; record_revision: number }>;
    success_criteria: string[];
    stop_conditions: string[];
    result_obligations: string[];
  };
}

export interface ChatCancellationTarget {
  work_item_id?: string | null;
  turn_id?: string | null;
}

export interface AIChatProviderInfo {
  id: string;
  label: string;
  available: boolean;
  capabilities: {
    reasoning: boolean;
    tools: boolean;
    attachments: boolean;
    vision: boolean;
    voice: boolean;
  };
}

export interface AIChatThread {
  id: string;
  provider_id: string;
  agent_id: string;
  /**
   * Provider-side session id captured after the first turn (via the
   * ``_meta`` SSE event the chat router consumes). Stable across
   * turns for the same conversation; used by ``useAIChatRuntime``
   * to derive the ``activeProviderSessionId`` that
   * ``PendingStagedChanges`` filters on.
   */
  provider_session_id?: string | null;
  active_work_item_id?: string | null;
  parked_work_item_id?: string | null;
  title: string;
  archived: boolean;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
  message_count?: number;
}

export interface AgentDescriptor {
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  role_label?: string;
}

export interface AgentPreferenceValue {
  provider_id: string;
  agent_id: string;
}

export interface AIChatPersistedMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  parts: Array<Record<string, unknown>>;
  parent_id?: string | null;
  provider_metadata?: Record<string, unknown>;
  created_at?: string;
}

export interface ChatFollowUpInput {
  client_request_id: string;
  after_work_item_id?: string;
  text: string;
  entity_refs: ChatEntityRef[];
}

interface ChatFollowUpReceipt {
  client_request_id: string;
  status: 'queued' | 'promoted' | 'steered' | 'dismissed';
}

export const aiChatApi = {
  async downloadChatAttachmentForReview(threadId: string, attachmentId: string, expectedSha256: string): Promise<Blob> {
    const response = await apiClient.get(
      `/chat/threads/${encodeURIComponent(threadId)}/attachments/${encodeURIComponent(attachmentId)}/review`,
      { params: { expected_sha256: expectedSha256 }, responseType: 'blob' },
    );
    return response.data as Blob;
  },

  async previewDocumentDraft(threadId: string, key: string, version: number): Promise<{title: string; body: string; format: string; version: number}> {
    const { data } = await apiClient.get(
      `/chat/threads/${encodeURIComponent(threadId)}/artifacts/${encodeURIComponent(key)}/preview`,
      { params: { version } },
    );
    return data;
  },

  async downloadDocumentDraft(threadId: string, key: string, version: number): Promise<{ blob: Blob; filename?: string }> {
    const response = await apiClient.get(
      `/chat/threads/${encodeURIComponent(threadId)}/artifacts/${encodeURIComponent(key)}/download`,
      { params: { version }, responseType: 'blob' },
    );
    const disposition = response.headers["content-disposition"];
    const filename = typeof disposition === "string"
      ? /filename="([A-Za-z0-9 ._-]+)"/.exec(disposition)?.[1]
      : undefined;
    return { blob: response.data as Blob, filename };
  },

  async queueFollowUp(threadId: string, input: ChatFollowUpInput) {
    const { data } = await apiClient.post<ChatFollowUpReceipt>(
      `/chat/threads/${encodeURIComponent(threadId)}/follow-ups`, input,
    );
    return data;
  },

  async listFollowUps(threadId: string) {
    const { data } = await apiClient.get<{ items: ChatFollowUpInput[]; paused: boolean }>(
      `/chat/threads/${encodeURIComponent(threadId)}/follow-ups`,
    );
    return data;
  },

  async resumeFollowUps(threadId: string) {
    await apiClient.post(
      `/chat/threads/${encodeURIComponent(threadId)}/follow-ups/resume`,
    );
  },

  async dismissFollowUp(threadId: string, id: string) {
    await apiClient.delete(
      `/chat/threads/${encodeURIComponent(threadId)}/follow-ups/${encodeURIComponent(id)}`,
    );
  },

  async listProviders(): Promise<AIChatProviderInfo[]> {
    const res = await apiClient.get<{ providers: AIChatProviderInfo[] }>(
      '/chat/providers',
    );
    return res.data.providers;
  },

  async listAgents(providerId: string): Promise<AgentDescriptor[]> {
    const res = await apiClient.get<{ agents: AgentDescriptor[] }>(
      `/chat/providers/${encodeURIComponent(providerId)}/agents`,
    );
    return res.data.agents;
  },

  async getAgentPreference(
    workspaceId: string,
  ): Promise<AgentPreferenceValue | null> {
    const res = await apiClient.get<{
      preference: AgentPreferenceValue | null;
    }>(`/workspaces/${encodeURIComponent(workspaceId)}/agent-preference`);
    return res.data.preference;
  },

  async setAgentPreference(
    workspaceId: string,
    body: AgentPreferenceValue,
  ): Promise<AgentPreferenceValue> {
    const res = await apiClient.put<{ preference: AgentPreferenceValue }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/agent-preference`,
      body,
    );
    return res.data.preference;
  },

  async listThreads(
    options: {
      includeArchived?: boolean;
      providerId?: string;
      agentId?: string;
    } = {},
  ): Promise<AIChatThread[]> {
    const params: Record<string, unknown> = {
      include_archived: options.includeArchived ?? false,
    };
    if (options.providerId) params.provider_id = options.providerId;
    if (options.agentId) params.agent_id = options.agentId;
    const res = await apiClient.get<{ threads: AIChatThread[] }>(
      '/chat/threads',
      { params },
    );
    return res.data.threads;
  },

  async createThread(
    providerId: string,
    options: { agentId?: string; title?: string } = {},
  ): Promise<AIChatThread> {
    const body: Record<string, string> = { provider_id: providerId };
    if (options.agentId) body.agent_id = options.agentId;
    if (options.title) body.title = options.title;
    const res = await apiClient.post<AIChatThread>('/chat/threads', body);
    return res.data;
  },

  async getThread(
    threadId: string,
  ): Promise<AIChatThread & { messages: AIChatPersistedMessage[] }> {
    const res = await apiClient.get<
      AIChatThread & { messages: AIChatPersistedMessage[] }
    >(`/chat/threads/${encodeURIComponent(threadId)}`);
    return res.data;
  },

  async listMandateReviews(threadId: string) {
    const { data } = await apiClient.get<{ reviews: MandateReviewSummary[]; can_propose: boolean }>(
      `/chat/threads/${encodeURIComponent(threadId)}/mandate-reviews`,
    );
    return data;
  },

  async proposeEntryReadMandate(threadId: string, proposal: EntryReadMandateProposal) {
    const { data } = await apiClient.post<ChatMandateReview>(
      `/chat/threads/${encodeURIComponent(threadId)}/mandate-reviews/entry-read`,
      proposal,
    );
    return data;
  },

  async getMandateReview(threadId: string, workItemId: string) {
    const { data } = await apiClient.get<ChatMandateReview>(
      `/chat/threads/${encodeURIComponent(threadId)}/work-items/${encodeURIComponent(workItemId)}/mandate-review`,
    );
    return data;
  },

  async actOnMandateReview(
    threadId: string,
    workItemId: string,
    action: 'approve' | 'reject' | 'run' | 'stop',
    reviewDigest: string,
  ) {
    await apiClient.post(
      `/chat/threads/${encodeURIComponent(threadId)}/work-items/${encodeURIComponent(workItemId)}/mandate-review/${action}`,
      { review_digest: reviewDigest },
    );
  },

  async getThreadIfChanged(threadId: string, revision: string) {
    const { data } = await apiClient.get<
      (AIChatThread & { messages: AIChatPersistedMessage[] }) | { unchanged: true }
    >(`/chat/threads/${encodeURIComponent(threadId)}`, {
      params: { known_revision: revision },
      timeout: 5000,
    });
    return "unchanged" in data ? null : data;
  },

  async renameThread(threadId: string, title: string): Promise<AIChatThread> {
    const res = await apiClient.patch<AIChatThread>(
      `/chat/threads/${encodeURIComponent(threadId)}`,
      { title },
    );
    return res.data;
  },

  async archiveThread(threadId: string): Promise<AIChatThread> {
    const res = await apiClient.delete<AIChatThread>(
      `/chat/threads/${encodeURIComponent(threadId)}`,
    );
    return res.data;
  },

  async deleteThread(threadId: string): Promise<void> {
    await apiClient.delete(
      `/chat/threads/${encodeURIComponent(threadId)}?hard=true`,
    );
  },

  /**
   * Persist a non-model-generated assistant note to a thread. Used by
   * the staging cards to record their "✓ Filed *X* in *Y*. Anything
   * else?" confirmation as a real ChatMessage so it survives reload —
   * the runtime's local optimistic append handles immediate visibility,
   * and this call ensures the line is in the persisted transcript when
   * the user navigates back to the chat.
   */
  async appendSystemMessage(
    threadId: string,
    text: string,
  ): Promise<AIChatPersistedMessage> {
    const res = await apiClient.post<AIChatPersistedMessage>(
      `/chat/threads/${encodeURIComponent(threadId)}/system-message`,
      { text },
    );
    return res.data;
  },

  /** Cancel the observed turn and wait for backend admission to be released. */
  async cancelThread(
    threadId: string,
    target?: ChatCancellationTarget | null,
    onTarget?: (target: ChatCancellationTarget) => void,
  ): Promise<{ thread_id: string; cancelled: boolean }> {
    if (!target) {
      const { data } = await apiClient.get<
        ChatCancellationTarget & { running: boolean }
      >(`/chat/threads/${encodeURIComponent(threadId)}/activity`, {
        timeout: 5000,
      });
      if (data.running === false)
        return { thread_id: threadId, cancelled: true };
      if (data.running !== true || (!data.work_item_id && !data.turn_id)) {
        throw new Error('Could not confirm the active turn. Try Stop again.');
      }
      target = { work_item_id: data.work_item_id, turn_id: data.turn_id };
      onTarget?.(target);
    }
    const res = await apiClient.post<{
      thread_id: string;
      cancelled: boolean;
      work_item_id?: string;
      turn_id?: string | null;
    }>(
      `/chat/threads/${encodeURIComponent(threadId)}/cancel`,
      {
        expected_work_item_id: target.work_item_id,
        expected_turn_id: target.turn_id,
      },
      { timeout: 10_000 },
    );
    if (!res.data.cancelled) return res.data;
    const deadline = Date.now() + 30_000;
    let pollDelay = 500;
    while (true) {
      const { data } = await apiClient.get<{
        running: boolean;
        work_item_id?: string | null;
        turn_id?: string | null;
      }>(`/chat/threads/${encodeURIComponent(threadId)}/activity`, {
        timeout: 5000,
      });
      if (typeof data.running !== 'boolean')
        throw new Error('Could not confirm cancellation. Try Stop again.');
      const hasTarget = Boolean(res.data.work_item_id || res.data.turn_id);
      const sameWork = Boolean(
        res.data.work_item_id && res.data.work_item_id === data.work_item_id,
      );
      const sameTurn = Boolean(
        res.data.turn_id && res.data.turn_id === data.turn_id,
      );
      // A newer turn in another tab must not extend this cancellation or be stopped.
      if (!data.running || (hasTarget && !sameWork && !sameTurn))
        return res.data;
      if (Date.now() >= deadline) {
        throw new Error(
          'Stopping is taking longer than expected. Try Stop again to check cancellation.',
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(pollDelay, deadline - Date.now())),
      );
      pollDelay = Math.min(pollDelay * 2, 2000);
    }
  },
};
