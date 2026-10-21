import type { ChatEntityRef } from "../../../types/chatEntityRefs";
import type { ChatPageContextPayload } from "../../../types/chatPageContext";

/**
 * AI chat provider contract.
 *
 * Adapters translate provider-native streams into a normalized event sequence
 * so the assistant-ui surface stays decoupled from any specific harness
 * (native provider, OpenAI, LangGraph, etc.).
 *
 * See `.planning/initiatives/ai-chat/SPEC.md` § 6.3 for the full envelope.
 */

export type NormalizedEvent =
  | { type: "text-delta"; delta: string }
  | { type: "text-replace"; content: string }
  | { type: "reasoning-delta"; delta: string; segmentId?: string }
  | {
      type: "tool-call";
      toolCallId: string;
      name: string;
      args?: unknown;
      status: "pending" | "running" | "complete" | "error";
      result?: unknown;
      diagnostic?: { code: string; message: string };
      error?: string;
    }
  | { type: "source"; sourceType: "url" | "graph"; ref: string; title?: string }
  | { type: "status"; text: string }
  | {
      type: "step";
      usage?: { inputTokens?: number; outputTokens?: number };
      usageComplete?: boolean;
      inputTokensReported?: boolean;
      outputTokensReported?: boolean;
      costComplete?: boolean;
      modelId?: string;
      provider?: string;
      providerCostUsd?: number;
      costSource?:
        | "litellm_response"
        | "provider_response"
        | "litellm_calculated"
        | "unavailable";
      durationMs?: number;
      outcome?: "responded" | "failed" | "cancelled" | "outcome_unknown";
      attempt?: number;
      requestId?: string;
      finishReason?: string;
    }
  | {
      type: "message-finish";
      timing?: { firstTokenMs?: number; totalMs?: number; tps?: number };
    }
  | { type: "error"; code: string; message: string }
  | { type: "interact-context"; payload: Record<string, unknown> }
  // Authoritative final answer for the turn, captured at end-of-stream (the
  // native provider `final` chunk). `content` = settled answer text; `payload` = the
  // full final chunk. Source-of-truth for the debug view's two panels.
  | {
      type: "final-content";
      content?: string;
      payload?: Record<string, unknown>;
    }
  // Bubble boundary: the turn published a distinct user-facing message (e.g. a
  // first-time intro greeting separate from the answer). The runtime finalizes
  // the current assistant bubble and starts a new one. Carries no payload.
  | { type: "message-boundary" };

/**
 * One agent the provider exposes. Empty `description` / `avatar_url` /
 * `role_label` are valid — the UI falls back to initials + a generic
 * "ASSISTANT" tag.
 */
export interface AgentDescriptor {
  /** Provider-native id used in API calls and persistence. For native provider
   *  this is the agent alias (stable across deploys). */
  id: string;
  name: string;
  description?: string;
  avatar_url?: string;
  role_label?: string;
}

/** An inline image attached to a turn (base64, for vision). */
export interface ChatImageInput {
  /** Base64-encoded image bytes (no ``data:`` URL prefix). */
  data: string;
  /** MIME type, e.g. ``image/png``. */
  content_type: string;
}

export interface TurnContext {
  threadId: string;
  userMessageText: string;
  /** Authenticated thread receipt to read after reload; never a new send. */
  resumeWorkItemId?: string;
  abortSignal: AbortSignal;
  /** Agent the active thread is bound to. Adapters MUST forward it on
   *  the stream request so the dispatcher can route correctly. */
  agentId?: string;
  /** Picker-selected @ / # references from the composer. */
  entityRefs?: ChatEntityRef[];
  /** Inline images the user attached — forwarded to the vision reflex. */
  images?: ChatImageInput[];
  /** Ids of general files already uploaded via the chat-upload endpoint
   *  (Slice B) — the backend builds a per-turn context note from these. */
  attachmentIds?: string[];
  /** Track detail page focus — forwarded to the agent for view-aware creates. */
  focusedTrackId?: string;
  focusedViewId?: string;
  /** App detail page focus — forwarded as focused_space_id on the API. */
  focusedAppId?: string;
  /** Snapshotted page context (URL, breadcrumbs, visible data) at send time. */
  pageContext?: ChatPageContextPayload;
  /** Host initiated continuation; never represented as a user utterance. */
  hostAction?: "prompt_sheet_resume" | "staging_follow_through";
}

export interface ChatProvider {
  id: string;
  label: string;
  /**
   * When true, the runtime allocates / persists the conversation through the
   * Integral backend (`/api/chat/threads`). When false, the provider is
   * client-only (mock / local fixtures) and the runtime keeps thread state in
   * memory without touching the backend.
   */
  serverPersisted: boolean;
  capabilities: {
    reasoning: boolean;
    tools: boolean;
    attachments: boolean;
    vision: boolean;
    /**
     * Harness-level voice (conversational audio in/out). NOT the composer's
     * dictation mic: dictation turns speech into text before send, works with
     * any harness, and is configured separately (features/speech).
     */
    voice: boolean;
  };
  streamTurn(ctx: TurnContext): AsyncIterable<NormalizedEvent>;
  /**
   * Catalog of agents this provider exposes for the calling user.
   * Empty array = single-agent provider; the UI hides its agent
   * switcher. Adapters MUST NOT cache internally — the caller scopes
   * calls per (provider, workspace).
   */
  listAgents(): Promise<AgentDescriptor[]>;
}
