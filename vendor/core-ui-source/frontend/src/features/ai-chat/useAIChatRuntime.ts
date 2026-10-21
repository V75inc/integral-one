import { friendlyAssistantText, friendlyChatFailure, friendlyToolFailure } from "./components/assistantMessagePresentation";
import { agentNavigationPath } from "./agentNavigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CompositeAttachmentAdapter,
  useExternalStoreRuntime,
  type AppendMessage,
  type ExternalStoreThreadListAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { aiChatApi, type AIChatThread, type AIChatPersistedMessage } from "../../api/aiChat";
import { useScope } from "../../context/ScopeContext";
import { useAuthOptional } from "../../context/AuthContext";
import { useChatPageFocus } from "../../context/ChatPageFocusContext";
import { useChatPageContextSnapshot } from "./useChatPageContextSnapshot";
import type { ChatEntityRef } from "../../types/chatEntityRefs";
import { normalizeEntityRefs } from "../../components/chat/chatEntityTokens";
import type {
  ChatImageInput,
  ChatProvider,
  NormalizedEvent,
} from "./providers/types";
import { createImageAttachmentAdapter } from "./attachments/imageAttachmentAdapter";
import { createFileAttachmentAdapter } from "./attachments/fileAttachmentAdapter";
import { useAgentCatalog } from "./useAgentCatalog";
import { groupThreadsByRecency } from "./threadGrouping";
import { resolveEditTurn, resolveReloadTurn } from "./turnContextHelpers";
import {
  clearIdleTranscripts,
  evictOtherWorkspaces,
  getThreadSessionSnapshot,
  getRemoteTurnsSnapshot,
  markRemoteTurnFinished,
  markRemoteTurnStarted,
  markThreadStreaming,
  nextLocalId,
  subscribeRemoteTurns,
  peekSessions,
  peekStreamingThreadIds,
  subscribeThreadSessions,
  unmarkThreadStreaming,
  updateThreadSession,
} from "./threadSessionStore";
import {
  MAX_CONCURRENT_STREAMS,
  THREAD_ALREADY_RESPONDING,
  type ThreadSessionState,
} from "./threadSessionRegistry";
import {
  OPEN_AI_CHAT_EVENT,
  consumeChatHandoff,
  prefersFreshChat,
  rememberFreshChat,
  peekChatHandoff,
  peekLastActiveChatThreadId,
  rememberActiveChatThreadId,
} from "./chatHandoff";

/**
 * Identity `convertMessage` for `useExternalStoreRuntime` — module-level so
 * it is referentially stable across renders.
 *
 * assistant-ui's `ExternalStoreThreadRuntimeCore.__internal_setAdapter`
 * compares `oldStore.convertMessage !== store.convertMessage` to decide
 * whether to rebuild its message converter; when they differ it skips the
 * `messages` fast-path bail-out (which would otherwise short-circuit when
 * `isRunning` and `messages` are unchanged) and unconditionally calls
 * `_notifySubscribers()` at the end of the full conversion path instead. An
 * inline `(m) => m` here is a new function every render, so that branch was
 * *always* taken — every render notified the store's `useSyncExternalStore`
 * subscribers, which re-rendered this hook, which passed a new inline
 * `convertMessage` again: an infinite loop, surfaced as React's "Maximum
 * update depth exceeded. The result of getSnapshot should be cached to
 * avoid an infinite loop." on every page (the chat dock mounts everywhere).
 */
function identityConvertMessage(m: ThreadMessageLike): ThreadMessageLike {
  return m;
}

export type ObservabilityStep = {
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
  usageComplete?: boolean;
  inputTokensReported?: boolean;
  outputTokensReported?: boolean;
  costComplete?: boolean;
  usage?: { inputTokens?: number; outputTokens?: number };
};

type AssistantMessageDraft = {
  id: string;
  textParts: string[];
  reasoningSegments: Map<string, string>;
  reasoningOrder: string[];
  toolCalls: Map<
    string,
    {
      name: string;
      args?: unknown;
      result?: unknown;
      diagnostic?: { code: string; message: string };
      isError?: boolean;
      status: "pending" | "running" | "complete" | "error";
    }
  >;
  toolCallOrder: string[];
  sources: Array<{ type: "url" | "graph"; ref: string; title?: string }>;
  status?: ThreadMessageLike["status"];
  timing?: NonNullable<ThreadMessageLike["metadata"]>["timing"];
  steps?: NonNullable<ThreadMessageLike["metadata"]>["steps"];
  customSteps?: ObservabilityStep[];
  interactPayload?: Record<string, unknown>;
  // Authoritative final answer (native provider `final` chunk): `finalContent` = the
  // settled answer text, `finalPayload` = the full final chunk. Debug-view
  // source-of-truth.
  finalContent?: string;
  finalPayload?: Record<string, unknown>;
  errorCode?: string;
  errorDetail?: string;
};

function freshDraft(id: string): AssistantMessageDraft {
  return {
    id,
    textParts: [],
    reasoningSegments: new Map(),
    reasoningOrder: [],
    toolCalls: new Map(),
    toolCallOrder: [],
    sources: [],
  };
}

/** True when the draft has user-visible body parts (not just timing / final payload). */
export function draftHasVisibleParts(draft: AssistantMessageDraft): boolean {
  if (draft.textParts.some((t) => t.length > 0)) return true;
  if (draft.toolCallOrder.length > 0) return true;
  if (draft.sources.length > 0) return true;
  for (const key of draft.reasoningOrder) {
    if ((draft.reasoningSegments.get(key) ?? "").length > 0) return true;
  }
  return false;
}

function isTurnLevelEvent(ev: NormalizedEvent): boolean {
  return (
    ev.type === "step" ||
    ev.type === "message-finish" ||
    ev.type === "final-content" ||
    ev.type === "interact-context"
  );
}

type MutableContent = NonNullable<
  Exclude<ThreadMessageLike["content"], string>
>[number];

/**
 * Merge all reasoning segments of a turn into ONE growing string, joined in
 * arrival order with a blank line between segments.
 *
 * jvchat parity: assistant-ui's `smooth` markdown interpolates a single
 * growing part character-by-character. Emitting one `{type:"reasoning"}` part
 * PER segment instead makes each backend reasoning tick land as its own
 * discrete block (the "chunky" thinking stream). Coalescing to a single part
 * lets the live thinking stream type in smoothly, like the answer.
 */
export function mergeReasoning(
  order: string[],
  segs: Map<string, string> | Record<string, string>,
): string {
  const get = (key: string): string =>
    segs instanceof Map ? (segs.get(key) ?? "") : (segs[key] ?? "");
  const parts: string[] = [];
  for (const key of order) {
    const text = get(key);
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}

function draftToMessage(draft: AssistantMessageDraft): ThreadMessageLike {
  const content: MutableContent[] = [];

  // ONE merged reasoning part (not one per segment) so the live thinking
  // stream interpolates smoothly via `MarkdownText` / assistant-ui `smooth`.
  const reasoning = mergeReasoning(draft.reasoningOrder, draft.reasoningSegments);
  if (reasoning) content.push({ type: "reasoning", text: reasoning });

  for (const callId of draft.toolCallOrder) {
    const call = draft.toolCalls.get(callId);
    if (!call) continue;
    content.push({
      type: "tool-call",
      toolCallId: callId,
      toolName: call.name,
      args: (call.args ?? {}) as never,
      result: toolSummaryResult(call),
      isError: call.isError,
    });
  }

  const text = draft.textParts.join("");
  if (text) content.push({ type: "text", text });

  for (const src of draft.sources) {
    content.push({
      type: "source",
      sourceType: "url",
      id: src.ref,
      url: src.ref,
      title: src.title,
    });
  }

  return {
    id: draft.id,
    role: "assistant",
    content: content.length > 0 ? content : [{ type: "text", text: "" }],
    status: draft.status,
    metadata: {
      timing: draft.timing,
      steps: draft.steps,
      custom:
        draft.customSteps?.length ||
        draft.interactPayload ||
        draft.finalContent ||
        draft.finalPayload ||
        draft.errorCode
          ? {
              ...(draft.errorCode ? { errorCode: draft.errorCode } : undefined),
              ...(draft.errorDetail ? { errorDetail: draft.errorDetail } : undefined),
              ...(draft.customSteps?.length
                ? { steps: draft.customSteps }
                : undefined),
              ...(draft.interactPayload
                ? { interactPayload: draft.interactPayload }
                : undefined),
              ...(draft.finalContent
                ? { finalContent: draft.finalContent }
                : undefined),
              ...(draft.finalPayload
                ? { finalPayload: draft.finalPayload }
                : undefined),
            }
          : undefined,
    },
  };
}

/**
 * assistant-ui's composer NEVER inlines attachment content into
 * ``message.content`` — ``send()`` (base-composer-runtime-core) builds
 * ``content: text ? [{type:"text",text}] : []`` and puts each resolved
 * attachment's parts on the SEPARATE ``message.attachments[].content``
 * array (see ``ThreadUserMessage`` in ``@assistant-ui/core``). Reading only
 * ``message.content`` for images silently drops every attached image — the
 * bug behind "I didn't receive an image with your message." Collect parts
 * from both so a future adapter that *does* inline content still works.
 */
export function attachmentContentParts(
  message: AppendMessage,
): readonly MutableContent[] {
  const fromAttachments = (message.attachments ?? []).flatMap(
    (a) => (a.content ?? []) as MutableContent[],
  );
  return [...(message.content as MutableContent[]), ...fromAttachments];
}

/**
 * Extract inline image attachments from an append message's content as
 * ``{ data, content_type }`` (the backend turn shape). The image adapter emits
 * ``{ type: "image", image: <data-URL> }`` parts; parse the data URL into its
 * MIME type + raw base64.
 */
export function imagesFromContent(
  content: readonly MutableContent[],
): ChatImageInput[] {
  const out: ChatImageInput[] = [];
  for (const part of content) {
    if ((part as { type?: string }).type !== "image") continue;
    const img = (part as { image?: unknown }).image;
    if (typeof img !== "string") continue;
    const match = /^data:([^;,]+)[^,]*,(.*)$/s.exec(img);
    if (match) {
      out.push({ content_type: match[1], data: match[2] });
    } else {
      out.push({
        content_type:
          (part as { contentType?: string }).contentType ?? "image/png",
        data: img,
      });
    }
  }
  return out;
}

/**
 * Extract chat-uploaded-file ids from an append message's content. The file
 * adapter (Slice B — general file persistence) uploads at `send()` time and
 * stashes the resulting attachment id as a non-standard `attachment_id`
 * field on its `{type:"file"}` part (see `fileAttachmentAdapter.ts`).
 */
export function attachmentIdsFromContent(content: readonly MutableContent[]): string[] {
  const out: string[] = [];
  for (const part of content) {
    if ((part as { type?: string }).type !== "file") continue;
    const id = (part as { attachment_id?: unknown }).attachment_id;
    if (typeof id === "string" && id) out.push(id);
  }
  return out;
}

function userMessageFromAppend(
  message: AppendMessage,
  id: string,
  entityRefs?: ChatEntityRef[],
): ThreadMessageLike {
  const text =
    message.content
      .map((p) => (p.type === "text" ? p.text : ""))
      .join("") || "";
  // Keep image/file attachment parts on the rendered message so the user
  // sees what they sent. Attachment content lives on
  // `message.attachments[].content`, not `message.content` — see
  // `attachmentContentParts`.
  const attachmentParts = attachmentContentParts(message).filter((p) => {
    const t = (p as { type?: string }).type;
    return t === "image" || t === "file";
  });
  const content = [
    { type: "text", text },
    ...attachmentParts,
  ] as ThreadMessageLike["content"];
  const base: ThreadMessageLike = {
    id,
    role: "user",
    content,
  };
  if (entityRefs?.length) {
    return {
      ...base,
      metadata: { custom: { entityRefs: normalizeEntityRefs(entityRefs) } },
    };
  }
  return base;
}

/**
 * Coalesce any reasoning parts in a persisted message into a single growing
 * reasoning part (kept at the position of the first reasoning part), so a
 * reloaded turn matches the live-streamed one (one smooth thinking block, not
 * N discrete blocks). Non-reasoning parts pass through untouched.
 */
function coalescePersistedReasoning(parts: MutableContent[]): MutableContent[] {
  const reasoningTexts: string[] = [];
  for (const p of parts) {
    if ((p as { type?: string }).type === "reasoning") {
      const t = (p as { text?: string }).text ?? "";
      if (t) reasoningTexts.push(t);
    }
  }
  if (reasoningTexts.length <= 1) return parts;
  const merged = reasoningTexts.join("\n\n");
  const out: MutableContent[] = [];
  let emitted = false;
  for (const p of parts) {
    if ((p as { type?: string }).type === "reasoning") {
      if (!emitted) {
        out.push({ type: "reasoning", text: merged });
        emitted = true;
      }
      continue;
    }
    out.push(p);
  }
  return out;
}

export function toolSummaryResult(call: {
  result?: unknown;
  diagnostic?: unknown;
  status?: unknown;
  isError?: unknown;
}): unknown {
  if (call.result !== undefined) return call.result;
  const diagnostic = call.diagnostic as { code?: unknown; message?: unknown } | undefined;
  if (diagnostic && typeof diagnostic.message === "string") {
    return { error: true, error_code: diagnostic.code, message: friendlyToolFailure({ error_code: diagnostic.code }) };
  }
  if (call.status === "error" || call.isError === true) {
    return { error: true, message: "I couldn't finish this step. Check anything already saved before trying again." };
  }
  if (call.status === "complete") {
    // assistant-ui otherwise inherits the parent turn's error when a completed
    // tool has no retained raw result, blaming every earlier call for one limit.
    return { message: "This step finished." };
  }
  return undefined;
}


/**
 * Normalize persisted message parts so that image and file parts conform to
 * assistant-ui's expected shapes.
 *
 * The backend persists user image parts as:
 * ``{ type: "image", data: "<base64>", content_type: "image/png", image_id: "..." }``.
 * assistant-ui expects an ``image`` field with the data URL (or URL) to display
 * the image in the conversation. If ``image`` is missing, rebuild it from ``data``
 * and ``content_type``.
 *
 * Tool/harness failures arrive as ``{ type: "error", code, message }``. That
 * part type is not in assistant-ui's content union — strip it here and surface
 * the message via ``status: incomplete`` on the assistant row (see
 * ``persistedToMessage``). Converting it to text *and* setting MessageError /
 * streamError stacked the same failure three ways in the dock.
 */
export function normalizePersistedParts(rawParts: MutableContent[]): MutableContent[] {
  const out: MutableContent[] = [];
  const toolPositions = new Map<string, number>();
  for (const part of rawParts) {
    const p = part as Record<string, unknown>;
    if (p && p.type === "error") {
      continue;
    }
    // Older durable transcripts saved start/result updates as separate parts.
    // Hydrate one resource per call ID, preserving its position and latest state.
    if (p?.type === "tool-call" && typeof p.toolCallId === "string" && p.toolCallId) {
      const summaryResult = toolSummaryResult(p);
      const normalized = { ...part, result: summaryResult } as MutableContent;
      const previous = toolPositions.get(p.toolCallId);
      if (previous !== undefined) {
        out[previous] = {
          ...out[previous], ...normalized,
          result: p.result ?? (p.diagnostic || p.status === "error"
            ? summaryResult
            : (out[previous] as Record<string, unknown>).result ?? summaryResult),
        } as MutableContent;
      } else {
        toolPositions.set(p.toolCallId, out.length);
        out.push(normalized);
      }
      continue;
    }
    if (p && p.type === "image") {
      if (!p.image && typeof p.data === "string" && p.data) {
        const contentType = (p.content_type || p.contentType || "image/png") as string;
        const dataUrl = p.data.startsWith("data:")
          ? p.data
          : `data:${contentType};base64,${p.data}`;
        out.push({
          ...p,
          type: "image",
          image: dataUrl,
        } as MutableContent);
        continue;
      }
    }
    out.push(part);
  }
  return out;
}

/** First persisted ``error`` part message, if any — for assistant ``status``. */
export function persistedAssistantErrorMessage(
  rawParts: MutableContent[],
): string | null {
  for (const part of rawParts) {
    const p = part as Record<string, unknown>;
    if (!p || p.type !== "error") continue;
    return friendlyChatFailure(p.code, p.message);
  }
  return null;
}

/** The model keeps ending a design at "Please confirm or". Finish the sentence. */
export function completeCutDesignInvitation(text: string): string {
  return text.replace(
    /Please confirm or\s*$/i,
    "Confirm this design, or tell me what to change.",
  );
}

function repairCutDesignInvitation(parts: MutableContent[]): MutableContent[] {
  let lastText = -1;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] as { type?: string; text?: string };
    if (part?.type === "text" && typeof part.text === "string") lastText = i;
  }
  if (lastText < 0) return parts;
  const joined = parts
    .filter((part) => (part as { type?: string }).type === "text")
    .map((part) => (part as { text: string }).text)
    .join("");
  const fixed = completeCutDesignInvitation(joined);
  if (fixed === joined) return parts;
  const last = parts[lastText] as { type: "text"; text: string };
  const prefixLen = joined.length - last.text.length;
  const next = parts.slice();
  next[lastText] = { ...parts[lastText], type: "text", text: fixed.slice(prefixLen) };
  return next;
}

function persistedToMessage(m: AIChatPersistedMessage): ThreadMessageLike {
  const role: "assistant" | "user" | "system" =
    m.role === "assistant" || m.role === "system" ? m.role : "user";
  const rawParts = (m.parts ?? []) as MutableContent[];
  const turnError =
    role === "assistant" ? persistedAssistantErrorMessage(rawParts) : null;
  const normalizedParts = normalizePersistedParts(rawParts).map((part) =>
    role === "assistant" && part.type === "text"
      ? { ...part, text: friendlyAssistantText(part.text) }
      : part,
  );
  const parts = repairCutDesignInvitation(
    coalescePersistedReasoning(normalizedParts),
  );
  const content: MutableContent[] =
    parts.length > 0 ? parts : [{ type: "text", text: "" }];
  // assistant-ui throws "status is only supported for assistant messages"
  // if `status` is set on user/system rows. Build the literal in two
  // shapes — TS's discriminated-union enforces this; mutating an
  // already-built ThreadMessageLike is rejected because `status` lives
  // only on the assistant variant.
  if (role === "assistant") {
    const pm = m.provider_metadata as
      | {
          steps?: Array<{
            usage?: { inputTokens?: number; outputTokens?: number };
            modelId?: string;
            finishReason?: string;
          }>;
          timing?: {
            firstTokenMs?: number;
            totalMs?: number;
            tps?: number;
          };
          interactPayload?: Record<string, unknown>;
          finalContent?: string;
          finalPayload?: Record<string, unknown>;
          error?: { code?: string; message?: string } | null;
        }
      | undefined;
    const pmSteps = Array.isArray(pm?.steps) ? pm!.steps : [];
    const pmTiming = pm?.timing;
    const pmInteract = pm?.interactPayload;
    const pmFinalContent = pm?.finalContent;
    const pmFinalPayload = pm?.finalPayload;
    const toolCallCount = content.filter(
      (p) => (p as { type: string }).type === "tool-call",
    ).length;
    // Prefer the error part; fall back to provider_metadata.error so older
    // rows that only stamped metadata still show MessageError once.
    const metaError =
      typeof pm?.error?.message === "string" && pm.error.message.trim()
        ? friendlyChatFailure(pm.error.code, pm.error.message)
        : null;
    const errorMessage = turnError ?? metaError;
    // Cancellation is an intentional user action, including when restored
    // from older transcripts that persisted it as an error event.
    const persistedError = rawParts.find(
      (part) => (part as { type?: string }).type === "error",
    ) as { code?: string; message?: string } | undefined;
    const errorCode = persistedError?.code ?? pm?.error?.code;
    const isCancelled = errorCode === "work.cancelled";

    const hasMetadata =
      pmSteps.length > 0 ||
      !!pmTiming ||
      !!pmInteract ||
      !!pmFinalContent ||
      !!pmFinalPayload ||
      !!errorCode;
    return {
      id: m.id,
      role: "assistant",
      content,
      status: isCancelled
        ? { type: "incomplete", reason: "cancelled" }
        : errorMessage
          ? { type: "incomplete", reason: "error", error: errorMessage }
          : { type: "complete", reason: "stop" },
      metadata: hasMetadata
        ? {
            steps: pmSteps.map((s) => ({
              messageId: m.id,
              usage: s.usage?.inputTokens != null && s.usage.outputTokens != null
                ? {
                    inputTokens: s.usage.inputTokens,
                    outputTokens: s.usage.outputTokens,
                  }
                : undefined,
            })),
            timing: pmTiming
              ? {
                  streamStartTime: 0,
                  firstTokenTime: pmTiming.firstTokenMs,
                  totalStreamTime: pmTiming.totalMs,
                  tokensPerSecond: pmTiming.tps,
                  tokenCount: pmSteps.reduce(
                    (sum, s) => sum + (s.usage?.outputTokens ?? 0),
                    0,
                  ),
                  totalChunks: 0,
                  toolCallCount,
                }
              : undefined,
            custom: {
              ...(errorCode ? { errorCode } : undefined),
              ...(persistedError?.message || pm?.error?.message
                ? { errorDetail: persistedError?.message || pm?.error?.message }
                : undefined),
              ...(pmSteps.length > 0 ? { steps: pmSteps } : undefined),
              ...(pmInteract ? { interactPayload: pmInteract } : undefined),
              ...(pmFinalContent
                ? { finalContent: pmFinalContent }
                : undefined),
              ...(pmFinalPayload
                ? { finalPayload: pmFinalPayload }
                : undefined),
            },
          }
        : undefined,
    };
  }
  const pm = m.provider_metadata as
    | { entity_refs?: ChatEntityRef[]; custom?: { entityRefs?: ChatEntityRef[] } }
    | undefined;
  const entityRefs =
    pm?.custom?.entityRefs ??
    (Array.isArray(pm?.entity_refs) ? pm.entity_refs : undefined);
  if (entityRefs?.length) {
    return {
      id: m.id,
      role,
      content,
      metadata: { custom: { entityRefs: normalizeEntityRefs(entityRefs) } },
    };
  }
  return { id: m.id, role, content };
}

function messageText(m: ThreadMessageLike): string {
  if (typeof m.content === "string") return m.content;
  return (m.content ?? [])
    .map((p) => ((p as { type?: string }).type === "text" ? ((p as { text?: string }).text ?? "") : ""))
    .join("");
}

function metaHasObservability(
  meta: Record<string, unknown> | undefined,
): boolean {
  if (!meta) return false;
  const timing = meta.timing as { totalStreamTime?: number } | undefined;
  if (timing && (timing.totalStreamTime ?? 0) > 0) return true;
  const steps = meta.steps;
  if (Array.isArray(steps) && steps.length > 0) return true;
  const custom = meta.custom as
    | {
        steps?: unknown[];
        finalPayload?: unknown;
        finalContent?: unknown;
      }
    | undefined;
  if (custom?.steps && custom.steps.length > 0) return true;
  if (custom?.finalPayload) return true;
  if (custom?.finalContent) return true;
  return false;
}

/**
 * Prefer server metadata when it already carries run stats; otherwise keep
 * the live local tally so a cold-thread reconcile does not blank the meta bar.
 */
export function mergeObservabilityMetadata(
  server: Record<string, unknown> | undefined,
  local: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (metaHasObservability(server)) return server;
  if (metaHasObservability(local)) {
    if (!server) return local;
    const serverCustom = (server.custom as Record<string, unknown> | undefined) ?? {};
    const localCustom = (local!.custom as Record<string, unknown> | undefined) ?? {};
    return {
      ...server,
      timing: local!.timing ?? server.timing,
      steps: local!.steps ?? server.steps,
      custom: {
        ...serverCustom,
        ...localCustom,
        steps: localCustom.steps ?? serverCustom.steps,
        finalPayload: localCustom.finalPayload ?? serverCustom.finalPayload,
        finalContent: localCustom.finalContent ?? serverCustom.finalContent,
      },
    };
  }
  return server ?? local;
}

/**
 * Prefer server payload (humanized text, persisted metadata) but keep the
 * local id already wired into the live ExternalStore tree. Also preserve
 * local-only attachment parts and live-stream observability when the server
 * row was checkpointed before message-finish landed.
 */
function mergeMatchedTranscriptRow(
  server: ThreadMessageLike,
  local: ThreadMessageLike,
): ThreadMessageLike {
  const sParts = (server.content as MutableContent[]) ?? [];
  const matchParts = (local.content as MutableContent[]) ?? [];
  const serverHasAttachments = sParts.some(
    (p) =>
      (p as { type?: string }).type === "image" ||
      (p as { type?: string }).type === "file",
  );
  const localAttachments = matchParts.filter(
    (p) =>
      (p as { type?: string }).type === "image" ||
      (p as { type?: string }).type === "file",
  );
  const mergedContent =
    !serverHasAttachments && localAttachments.length > 0
      ? [...sParts, ...localAttachments]
      : sParts;

  const mergedMeta = mergeObservabilityMetadata(
    server.metadata as Record<string, unknown> | undefined,
    local.metadata as Record<string, unknown> | undefined,
  );

  return {
    ...server,
    id: local.id,
    content: mergedContent,
    ...(mergedMeta ? { metadata: mergedMeta } : undefined),
  };
}

/** Same turn: exact text, or both assistants (streamed prose ≠ persisted). */
function coldTranscriptPairCompatible(
  server: ThreadMessageLike,
  local: ThreadMessageLike,
): boolean {
  if (server.role !== local.role) return false;
  if (messageText(server) === messageText(local)) return true;
  return server.role === "assistant";
}

/**
 * Merge a server transcript into a thread whose cache was never loaded
 * (a send on a cold thread drafted messages before its history arrived).
 * Server rows are authoritative for content/metadata; local rows the server
 * does not have — matched by role + text — are appended so a draft the
 * server failed to persist is not silently dropped.
 *
 * When a local row matches a server row, **keep the local id**.
 * assistant-ui's ExternalStore repository does not clear on message-list
 * updates — replacing `u-local` with `s-server` for the same Hello leaves
 * both as root siblings and shows a spurious ``1 / 2`` branch picker.
 *
 * Prefer a **suffix** role+compatibility merge: the live draft is the newest
 * turn(s). Streamed assistant text often differs from the persisted row
 * (humanize, final-content, design-proposal echo); keying only on role+text
 * used to append a second assistant bubble and render the design card twice
 * until refresh. Suffix alignment avoids pairing a new ``hi`` with older
 * history that happens to share the same role pattern.
 */
export function mergeColdTranscript(
  server: ThreadMessageLike[],
  local: ThreadMessageLike[],
): ThreadMessageLike[] {
  if (local.length === 0) return server;
  if (server.length === 0) return local;

  if (server.length >= local.length) {
    const offset = server.length - local.length;
    const suffixCompatible = local.every((m, i) =>
      coldTranscriptPairCompatible(server[offset + i]!, m),
    );
    if (suffixCompatible) {
      const out = server.slice(0, offset);
      for (let i = 0; i < local.length; i++) {
        out.push(mergeMatchedTranscriptRow(server[offset + i]!, local[i]!));
      }
      return out;
    }
  }

  const key = (m: ThreadMessageLike) => `${m.role}\u0000${messageText(m)}`;
  const localByKey = new Map<string, ThreadMessageLike>();
  for (const m of local) {
    const k = key(m);
    if (!localByKey.has(k)) localByKey.set(k, m);
  }

  const out = server.map((s) => {
    const match = localByKey.get(key(s));
    if (!match) return s;
    return mergeMatchedTranscriptRow(s, match);
  });

  const seen = new Set(server.map(key));
  const extra = local.filter((m) => !seen.has(key(m)));
  return extra.length ? [...out, ...extra] : out;
}

export interface UseAIChatRuntimeOptions {
  onNavigate?: (path: string, threadId: string) => void;
  consumeEntityRefs?: () => ChatEntityRef[];
  resetComposerEntityRefs?: () => void;
  /** When set (e.g. from `/agent?thread=`), select this thread on mount. */
  initialThreadId?: string | null;
  /**
   * Skip the "auto-select the most recent thread" step and open on the
   * empty greeter instead. Onboarding uses this: resuming whatever the user
   * last talked about would put a welcome banner above an unrelated
   * conversation, and a first run should start on a blank page.
   */
  startNewThread?: boolean;
  handoffEnabled?: boolean;
}

export function useAIChatRuntime(
  provider: ChatProvider,
  options: UseAIChatRuntimeOptions = {},
) {
  const {
    consumeEntityRefs,
    // No `clearEntityRefs` option: pending refs are already emptied by
    // `consumeEntityRefs()` on send, and `resetComposerEntityRefs()` clears
    // pending + snapshot + composer chips after the turn. The only path that
    // runs neither is the `ensureThreadId()` failure below, where keeping the
    // refs is correct — the message never went out, so a retry still needs them.
    resetComposerEntityRefs,
    initialThreadId = null,
    startNewThread = false,
    handoffEnabled = true,
  } = options;
  // Active workspace drives the X-Integral-Scope header on every API
  // call (set globally in ScopeContext). The chat thread list is
  // server-side scoped to that workspace — when the user switches
  // workspaces, we clear the current thread + transcript and re-fetch
  // so the surface always reflects the active workspace's threads.
  const { scope } = useScope();
  const { focusedTrackId, focusedViewId, focusedAppId } = useChatPageFocus();
  const snapshotPageContext = useChatPageContextSnapshot();
  const workspaceId = scope?.workspaceId ?? null;
  const onNavigateRef = useRef(options.onNavigate);
  onNavigateRef.current = options.onNavigate;
  const navigationMountedRef = useRef(true);
  useEffect(() => {
    navigationMountedRef.current = true;
    return () => { navigationMountedRef.current = false; };
  }, []);
  const auth = useAuthOptional();
  const principalId = auth?.user?.id ?? null;
  const principalIdRef = useRef(principalId);
  principalIdRef.current = principalId;
  const selectionScopeReady = Boolean(workspaceId) && !auth?.loading && (auth === null || Boolean(principalId));
  const freshChatScope = useMemo(
    () => ({ principalId, workspaceId, providerId: provider.id }),
    [principalId, workspaceId, provider.id],
  );
  // Read the active agent for the current (provider, workspace). When the
  // provider has an empty catalog (MockEcho), activeAgent is null and we
  // fall through to unfiltered listing (single-agent mode).
  const { activeAgent } = useAgentCatalog(provider, workspaceId ?? "");
  const activeAgentId = activeAgent?.id ?? null;
  const [threads, setThreads] = useState<AIChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const selectionKey = JSON.stringify([principalId, workspaceId, provider.id, activeAgentId]);
  const [settledSelectionKey, setSettledSelectionKey] = useState<string | null>(null);
  const selectionReady = selectionScopeReady && (!provider.serverPersisted || settledSelectionKey === selectionKey);
  const selectThread = useCallback((threadId: string) => {
    if (handoffEnabled) rememberFreshChat(freshChatScope, false);
    setActiveThreadId(threadId);
  }, [freshChatScope, handoffEnabled]);
  /**
   * Per-thread transcript + stream state (I-CHAT-PAR-04), read from a
   * module-level store rather than local state so it outlives this hook
   * instance — closing the dock, opening `/agent`, or switching provider all
   * destroy the instance, and an in-flight turn used to die with it.
   */
  const store = useSyncExternalStore(
    subscribeThreadSessions,
    getThreadSessionSnapshot,
  );
  const sessions = store.sessions;
  const streamingThreadIds = store.streamingThreadIds;
  /** Turns running on threads this tab did not start (routines, other tabs). */
  const remoteTurns = useSyncExternalStore(
    subscribeRemoteTurns,
    getRemoteTurnsSnapshot,
  );
  const activeThreadIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);
  /** Mirror so `updateSession` can stamp a session's workspace without
   *  taking `workspaceId` as a dep and churning its identity. */
  const workspaceIdRef = useRef<string | null>(workspaceId);
  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    if (!handoffEnabled) return;
    rememberActiveChatThreadId(activeThreadId, workspaceIdRef.current);
  }, [activeThreadId, handoffEnabled]);

  // Companion handoff from /agent Created links — switch to the originating thread.
  useEffect(() => {
    if (!selectionScopeReady || !handoffEnabled) return;
    const apply = (threadId?: string | null) => {
      if (!threadId || threadId.startsWith("local-")) return;
      selectThread(threadId);
    };
    // Prefer event/handoff thread; fall back to last-active (survives handoff consume).
    const pending = peekChatHandoff();
    apply(pending?.threadId ?? (
      prefersFreshChat(freshChatScope) ? null : peekLastActiveChatThreadId(workspaceIdRef.current)
    ));

    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ threadId?: string | null }>).detail;
      apply(detail?.threadId ?? peekLastActiveChatThreadId(workspaceIdRef.current));
    };
    window.addEventListener(OPEN_AI_CHAT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_AI_CHAT_EVENT, onOpen);
  }, [freshChatScope, selectThread, selectionScopeReady, handoffEnabled]);

  // Guards concurrent callers (onNew + any in-flight attachment upload) from
  // creating two threads for the same first message — see ensureThreadId.
  const threadCreationPromiseRef = useRef<Promise<string> | null>(null);

  const activeSession =
    activeThreadId != null ? sessions[activeThreadId] : undefined;
  const messages = useMemo(
    () => activeSession?.messages ?? [],
    [activeSession],
  );
  // A turn running elsewhere (routine, another tab) is still a turn: the
  // composer must read busy rather than accept a send the server refuses.
  const isRunning =
    activeThreadId != null &&
    (streamingThreadIds.includes(activeThreadId) ||
      Boolean(activeSession?.cancellation) || activeThreadId in remoteTurns);
  const composerReady = selectionReady && (
    !provider.serverPersisted || activeThreadId == null ||
    activeThreadId.startsWith("local-") || isRunning ||
    (activeSession?.lastLoadedAt ?? 0) > 0
  );
  const activityText = isRunning ? (activeSession?.activityText ?? null) : null;
  // Not gated on `isRunning`: the errors worth showing are exactly the ones
  // that end the turn, and gating hid every one of them.
  const streamError = activeSession?.streamError ?? null;

  const updateSession = useCallback(
    (
      threadId: string,
      patch:
        | Partial<ThreadSessionState>
        | ((prev: ThreadSessionState) => ThreadSessionState),
    ) => {
      updateThreadSession(threadId, patch, {
        workspaceId: workspaceIdRef.current,
        protectThreadId: activeThreadIdRef.current,
      });
    },
    [],
  );

  // Busy is busy: a thread with a turn running elsewhere must read as active
  // in the rail, even though this tab holds no connection for it.
  const isThreadStreaming = useCallback(
    (threadId: string) =>
      streamingThreadIds.includes(threadId) || threadId in remoteTurns,
    [streamingThreadIds, remoteTurns],
  );

  // Module-level: ids have to be unique across runtime instances now that
  // they share a store (see nextLocalId).
  const nextId = useCallback((prefix: string) => nextLocalId(prefix), []);

  /**
   * Append an assistant-style message to the chat thread.
   *
   * Two-stage:
   *   1. Optimistic local append — message appears in the visible
   *      transcript IMMEDIATELY (no network round-trip).
   *   2. Persist to the backend via ``/chat/threads/{id}/system-message``
   *      so the line survives reload / navigation. Best-effort —
   *      a backend failure is logged but doesn't roll back the
   *      local message (we'd rather show a too-many-confirmation
   *      than confuse the user with a vanishing one).
   *
   * Why this bypasses the LLM: earlier we tried to nudge the agent
   * to say the line itself, but gpt-4o was unreliable — frequently
   * replied with generic "no further actions needed" even with
   * strict prompt directives. For deterministic affordances like
   * the staging-card "✓ Filed *X* in *Y*. Anything else?"
   * confirmation, we generate the text client-side and persist
   * via the system-message route (no model call needed).
   */
  const appendAssistantNote = useCallback(
    async (text: string): Promise<string | null> => {
      if (!text || !activeThreadId) return null;
      const threadId = activeThreadId;
      const noteId = nextId("a");
      updateSession(threadId, (session) => ({
        ...session,
        messages: [
          ...session.messages,
          {
            id: noteId,
            role: "assistant" as const,
            content: [{ type: "text" as const, text }],
            status: { type: "complete" as const, reason: "stop" as const },
          },
        ],
      }));
      if (!threadId.startsWith("local-") && provider.serverPersisted) {
        try {
          const persisted = await aiChatApi.appendSystemMessage(threadId, text);
          updateSession(threadId, (session) => ({
            ...session,
            messages: session.messages.map((message) =>
              message.id === noteId ? { ...message, id: persisted.id } : message,
            ),
          }));
          return persisted.id;
        } catch (err) {
          console.warn("appendAssistantNote: backend persistence failed", err);
          return null;
        }
      }
      return noteId;
    },
    [nextId, activeThreadId, provider, updateSession],
  );
  // Threads we just created locally inside onNew — the local message state
  // already represents the in-flight turn correctly, so the thread-load
  // effect must NOT re-fetch and overwrite it. (The server hasn't persisted
  // the assistant turn yet, and may not even have the user message
  // persisted by the time the load effect fires — racing the load with
  // append_message wipes the live draft.) Cleared on first read.
  const skipLoadForThreadIdRef = useRef<string | null>(null);
  // Tracks whether the initial-mount auto-selection has already run for
  // the current provider, so that a user who explicitly clicks "New
  // conversation" (clearing activeThreadId) is not snapped back to the
  // most recent thread on the next thread-list refresh.
  const initialAutoSelectDoneRef = useRef(false);
  // `initialThreadId` (a `?thread=` deep link) belongs to the workspace it was
  // opened in. Recorded with that workspace so a later switch does not
  // re-select the previous workspace's thread — the switch effect resets
  // `initialAutoSelectDoneRef` after this effect has already started its
  // fetch, and the resolved list used to re-apply the stale id.
  const initialThreadAppliedRef = useRef<{
    workspaceId: string | null;
    threadId: string;
  } | null>(null);

  const refreshThreads = useCallback(async () => {
    if (!provider.serverPersisted) return [];
    try {
      const list = await aiChatApi.listThreads({
        providerId: provider.id,
        agentId: activeAgentId ?? undefined,
      });
      setThreads(list);
      return list;
    } catch (err) {
      console.error("AI chat: failed to list threads", err);
      return [];
    }
  }, [provider.id, provider.serverPersisted, activeAgentId]);

  // Initial thread load + workspace-switch refresh (server-persisted only).
  //
  // Fetches the user's threads for the active workspace and auto-selects
  // the most recent. The backend orders by ``last_message_at`` desc; an
  // empty list leaves ``activeThreadId`` null so the composer renders an
  // empty greeter and the first send allocates a new thread.
  //
  // Re-runs on workspace switch: the dependency on ``workspaceId`` means
  // every scope change clears the current thread + transcript (handled
  // by the reset effect below) and re-loads the per-workspace list.
  //
  // ``initialAutoSelectDoneRef`` guards against re-snapping back to the
  // latest thread after an explicit "New conversation" click; reset on
  // workspace switch so the new workspace gets its own auto-select.
  useEffect(() => {
    if (!provider.serverPersisted || !selectionScopeReady) return;
    let cancelled = false;
    void (async () => {
      const list = await refreshThreads();
      if (cancelled) return;
      setSettledSelectionKey(selectionKey);
      if (initialAutoSelectDoneRef.current) return;
      initialAutoSelectDoneRef.current = true;
      // Threads were still listed above so the rail is populated; we just
      // decline to open one.
      if (startNewThread) return;
      const applied = initialThreadAppliedRef.current;
      if (initialThreadId && (!applied || applied.workspaceId === workspaceId)) {
        initialThreadAppliedRef.current = { workspaceId, threadId: initialThreadId };
        selectThread(initialThreadId);
        return;
      }
      if (prefersFreshChat(freshChatScope)) return;
      if (list.length > 0) {
        setActiveThreadId((current) => current ?? list[0].id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    provider.serverPersisted,
    refreshThreads,
    workspaceId,
    activeAgentId,
    initialThreadId,
    startNewThread,
    freshChatScope,
    selectionScopeReady,
    selectionKey,
    selectThread,
  ]);

  // Reset the initial-auto-select guard whenever the provider changes,
  // so a provider switch re-runs the "load last or new" decision against
  // the fresh thread list.
  useEffect(() => {
    initialAutoSelectDoneRef.current = false;
  }, [provider.id]);

  // Workspace switch: swap what is *shown*, keep what is *running*.
  //
  // This used to wipe every cached transcript and abort every in-flight
  // stream, including turns belonging to the workspace being entered — so
  // glancing at another workspace killed work the user had started and was
  // waiting on. Nothing about a scope change makes a running turn invalid.
  //
  // What still has to happen: the previous workspace's conversation must not
  // stay on screen, and the thread list has to be refetched for the new
  // scope. Both are display concerns, so both are handled by clearing the
  // *view* and evicting only the other workspace's idle transcripts.
  //
  // Seeded null (not from `workspaceId`) so the first resolution is caught by
  // the guard below rather than counting as a switch — the runtime can mount
  // before scope resolves, and `null -> ws:X` is a first run, not a change.
  // ScopeContext.tsx guards the same case for the same reason.
  const previousWorkspaceIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (previousWorkspaceIdRef.current === workspaceId) return;
    // `null -> ws:X` is scope resolving for the first time, not the user
    // moving. Adopt it silently; resetting here wiped state the instant
    // scope arrived on any runtime that mounted ahead of it.
    if (previousWorkspaceIdRef.current == null) {
      previousWorkspaceIdRef.current = workspaceId;
      return;
    }
    previousWorkspaceIdRef.current = workspaceId;
    initialAutoSelectDoneRef.current = false;
    setThreads([]);
    setActiveThreadId(null);
    // Streaming sessions survive; only the other workspace's idle
    // transcripts are dropped, so returning to a workspace mid-turn still
    // finds its live stream and partial text.
    evictOtherWorkspaces(workspaceId);
  }, [workspaceId]);

  // Agent switch: mirror the workspace-switch reset. Clear the open thread
  // + transcript, abort any in-flight stream, and reset the auto-select
  // guard so the threadlist effect picks the most recent thread of the
  // newly-selected agent.
  const previousAgentIdRef = useRef<string | null>(activeAgentId);
  useEffect(() => {
    if (previousAgentIdRef.current === activeAgentId) return;
    if (previousAgentIdRef.current == null) {
      // Resolving the initial catalog is not a user switching agents. In
      // particular, do not undo New conversation chosen while it loaded.
      previousAgentIdRef.current = activeAgentId;
      return;
    }
    previousAgentIdRef.current = activeAgentId;
    initialAutoSelectDoneRef.current = false;
    setActiveThreadId(null);
    // Idle transcripts only: a turn already running keeps its connection and
    // finishes on its own, exactly as on a workspace switch.
    clearIdleTranscripts();
  }, [activeAgentId]);

  // NOTE: there is deliberately no unmount cleanup aborting streams.
  // Surviving unmount is the point of the shared store — the dock closing
  // must not kill a turn `/agent` is showing, and vice versa. The stream
  // owns its own lifetime and writes into the store until it finishes.

  // Fetch a thread's persisted transcript and merge it into session cache.
  // Shared by the lazy-load-on-open effect below AND the push-refresh effect
  // (integral:thread-stream-update) — a scheduled routine's turn runs
  // server-side with no live SSE connection to this tab, so its messages
  // only reach an already-open thread via this same fetch, triggered by the
  // WS push rather than a mount/switch.
  const loadInFlightRef = useRef<Set<string>>(new Set());
  /** `ok` applied; `skip` deferred (do not stamp loaded); `error` fetch failed. */
  const loadThread = useCallback(
    async (threadId: string): Promise<"ok" | "skip" | "error"> => {
      // The lazy-load effect and the post-stream cold reload can both ask
      // for the same thread; the second fetch would replace the first's
      // merged transcript with a plain one.
      if (loadInFlightRef.current.has(threadId)) return "skip";
      loadInFlightRef.current.add(threadId);
      try {
        const t = await aiChatApi.getThread(threadId);
        if (activeThreadIdRef.current !== threadId && !(threadId in peekSessions())) {
          return "skip";
        }
        // Do not overwrite a cache that started streaming while we fetched.
        if (peekStreamingThreadIds().includes(threadId)) return "skip";
        // Durable host receipts drive continuation and audit, but are not
        // conversation bubbles (including after a reload or reconnect).
        const server = t.messages
          .filter(message => message.role !== "system")
          .map(persistedToMessage);
        updateSession(threadId, (session) => ({
          ...session,
          // A cache that was never loaded may hold messages drafted by a send
          // that raced this fetch; keep them rather than hide the history OR
          // the draft.
          messages:
            session.lastLoadedAt === 0
              ? mergeColdTranscript(server, session.messages)
              : server,
          lastLoadedAt: Date.now(),
          activeWorkItemId: t.provider_id === "integral_native" ? t.active_work_item_id ?? null : null,
        }));
        return "ok";
      } catch (err) {
        console.error("AI chat: failed to load thread", err);
        return "error";
      } finally {
        loadInFlightRef.current.delete(threadId);
      }
    },
    [updateSession],
  );

  // Lazy-load transcript when switching to a thread without a warm cache.
  useEffect(() => {
    let cancelled = false;
    if (!activeThreadId || !provider.serverPersisted) {
      return () => {
        cancelled = true;
      };
    }
    if (skipLoadForThreadIdRef.current === activeThreadId) {
      skipLoadForThreadIdRef.current = null;
      return () => {
        cancelled = true;
      };
    }
    // Skip fetch when this thread is streaming or already cached.
    if (streamingThreadIds.includes(activeThreadId)) {
      return () => {
        cancelled = true;
      };
    }
    const cached = peekSessions()[activeThreadId];
    if (cached && cached.lastLoadedAt > 0) {
      return () => {
        cancelled = true;
      };
    }
    void loadThread(activeThreadId).then((result) => {
      // `skip` = deferred (streaming / in-flight) — must NOT stamp loaded, or a
      // later server-only apply drops the cold-send draft and a post-stream
      // reload never runs.
      if (cancelled || result !== "error") return;
      // On the initial-load path (unlike push-refresh) a failed fetch must
      // still resolve the cache so we don't retry-loop on every render.
      if (activeThreadIdRef.current === activeThreadId) {
        // Keep whatever is drafted locally; only the retry loop is stopped.
        updateSession(activeThreadId, (session) => ({
          ...session,
          lastLoadedAt: Date.now(),
        }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeThreadId, provider.serverPersisted, streamingThreadIds, updateSession, loadThread]);

  // Push-driven refresh: a message landing on a thread from OUTSIDE this
  // tab's own live SSE stream (a scheduled routine's headless turn, or the
  // same account open in another tab/window) reaches us only through
  // /ws/agent-events -> useAgentiveWebSocket -> this window CustomEvent.
  // Without this listener the event was dispatched but never consumed —
  // assistant-ui's message list only ever updated from this tab's own
  // streamAssistantTurn, so a background-originated message stayed invisible
  // until a manual reload re-ran the lazy-load effect above.
  useEffect(() => {
    if (!provider.serverPersisted) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | {
            thread_id?: string;
            status?: string;
            workspace_id?: string;
            turn_id?: string;
          }
        | undefined;
      const threadId = detail?.thread_id;
      if (!threadId) return;
      // A turn this tab owns is already reflected by its own stream; the
      // events describe it too, and acting on them would race it.
      const isOurs = peekStreamingThreadIds().includes(threadId);

      if (detail.status === "started") {
        // Previously dropped. Without it, a turn started by a routine or
        // another window is invisible here until it happens to finish while
        // the thread is open.
        if (!isOurs) {
          markRemoteTurnStarted(
            threadId,
            detail.workspace_id ?? null,
            detail.turn_id ?? null,
          );
        }
        return;
      }

      if (detail.status !== "completed") return;
      markRemoteTurnFinished(threadId, detail.turn_id ?? null);
      if (isOurs) return;
      // Refetch only threads this tab has actually cached. One that was
      // never opened here has nothing to refresh — it loads fresh on first
      // open — and the badge above already recorded that it was busy.
      if (!(threadId in peekSessions())) return;
      void loadThread(threadId);
    };
    window.addEventListener("integral:thread-stream-update", handler);
    return () => {
      window.removeEventListener("integral:thread-stream-update", handler);
    };
  }, [provider.serverPersisted, loadThread]);

  /**
   * Why a turn cannot start on `threadId` right now, or null. Checked BEFORE
   * the user message is appended: a refused turn used to append the message
   * and then return with only a console.warn, so the user saw their text
   * land and nothing answer it.
   */
  const admissionError = useCallback((threadId: string, attachToRemote = false): string | null => {
    const streaming = peekStreamingThreadIds();
    if (peekSessions()[threadId]?.cancellation || streaming.includes(threadId) || (!attachToRemote && threadId in getRemoteTurnsSnapshot())) {
      return THREAD_ALREADY_RESPONDING;
    }
    if (streaming.length >= MAX_CONCURRENT_STREAMS) {
      return `Too many conversations are running (${MAX_CONCURRENT_STREAMS}). Stop one and try again.`;
    }
    return null;
  }, []);

  const streamAssistantTurn = useCallback(
    async (
      threadId: string,
      userText: string,
      priorMessages: ThreadMessageLike[],
      entityRefs?: ChatEntityRef[],
      images?: ChatImageInput[],
      attachmentIds?: string[],
      hostAction?: "prompt_sheet_resume" | "staging_follow_through",
      resumeWorkItemId?: string,
    ) => {
      const refused = admissionError(threadId, Boolean(resumeWorkItemId));
      if (refused) {
        // A thread that is already answering is not a failed turn. Recording
        // that as streamError left a red alert under the reply that just
        // finished. The running state is the signal; the unsent text stays
        // in the composer.
        if (refused !== THREAD_ALREADY_RESPONDING) {
          updateSession(threadId, (session) =>
            session.streamError === refused
              ? session
              : { ...session, streamError: refused },
          );
        }
        return;
      }

      let assistantId = nextId("a");
      let draft = freshDraft(assistantId);
      draft.status = { type: "running" };
      // After a ``message-boundary`` split, turn-level events (timing / final /
      // steps) often land on the new empty draft. Keep the closed bubble so
      // those events fold onto it instead of flushing a metadata-only orphan
      // (duplicate action bar under the model line).
      let closedDraft: AssistantMessageDraft | null = null;
      let closedId: string | null = null;
      let refreshedForReply = false;
      let navigationPath: string | null = null;
      let turnFailed = false;
      const navigationOrigin = window.location.pathname + window.location.search;
      const navigationWorkspace = workspaceIdRef.current;
      const navigationPrincipal = principalIdRef.current;
      const refreshApprovalQueue = () => window.dispatchEvent(
        new CustomEvent("integral:prompt-queue-refresh", { detail: { threadId } }),
      );

      const controller = new AbortController();
      markThreadStreaming(threadId);
      updateSession(threadId, {
        messages: [...priorMessages, draftToMessage(draft)],
        streaming: true,
        activityText: null,
        streamError: null,
        abortController: controller,
      });

      const flushDraft = (target: AssistantMessageDraft, targetId: string) => {
        updateSession(threadId, (session) => {
          const idx = session.messages.findIndex(
            (m) => (m as { id?: string }).id === targetId,
          );
          const nextMessages =
            idx === -1
              ? [...session.messages, draftToMessage(target)]
              : session.messages.map((m, i) =>
                  i === idx ? draftToMessage(target) : m,
                );
          return { ...session, messages: nextMessages };
        });
      };

      const flush = () => flushDraft(draft, assistantId);

      const dropDraftFromSession = (targetId: string) => {
        updateSession(threadId, (session) => ({
          ...session,
          messages: session.messages.filter(
            (m) => (m as { id?: string }).id !== targetId,
          ),
        }));
      };

      try {
        const pageContext = snapshotPageContext();
        const stream = provider.streamTurn({
          threadId,
          userMessageText: userText,
          abortSignal: controller.signal,
          agentId: activeAgentId ?? undefined,
          entityRefs,
          images: images?.length ? images : undefined,
          attachmentIds: attachmentIds?.length ? attachmentIds : undefined,
          focusedTrackId:
            focusedTrackId ?? pageContext.focused_track_id ?? undefined,
          focusedViewId:
            focusedViewId ?? pageContext.focused_view_id ?? undefined,
          focusedAppId:
            focusedAppId ?? pageContext.focused_app_id ?? undefined,
          pageContext,
          hostAction,
          resumeWorkItemId,
        });

        for await (const ev of stream as AsyncIterable<NormalizedEvent>) {
          if (controller.signal.aborted) break;
          if (ev.type === "navigation") {
            navigationPath = agentNavigationPath({ ok: true, navigation: ev }, threadId, navigationWorkspace);
            continue;
          }
          // Staging pushes can arrive before their transaction is visible.
          // Committed stream results and the first answer text give the sheet
          // a fresh read boundary without waiting for its idle poll.
          if (ev.type === "tool-call" && ev.status === "complete") {
            let result = ev.result;
            if (typeof result === "string") {
              try { result = JSON.parse(result); } catch { /* not a structured result */ }
            }
            if (result && typeof result === "object" && "_kind" in result && result._kind === "staged_change") {
              refreshApprovalQueue();
            }
          }
          if (!refreshedForReply && (ev.type === "text-delta" || ev.type === "text-replace")) {
            refreshedForReply = true;
            refreshApprovalQueue();
          }
          if (ev.type === "status") {
            const text = (ev as { text?: string }).text || "";
            if (text) {
              updateSession(threadId, (session) =>
                session.activityText === text
                  ? session
                  : { ...session, activityText: text },
              );
            }
          }
          if (ev.type === "tool-call" || ev.type === "text-delta" || ev.type === "text-replace") {
            // A retry notice describes a temporary pause. Once work resumes,
            // let the trail describe the current operation again. Preserve an
            // outstanding user cancellation until its acknowledgement arrives.
            updateSession(threadId, (session) =>
              session.activityText && session.cancellation !== "pending"
                ? { ...session, activityText: null }
                : session,
            );
          }
          if (ev.type === "error") {
            turnFailed = true;
            // MessageError (draft status incomplete) is the single surface for
            // turn failures. Do not also stamp streamError — ActivityStrip was
            // echoing the same copy under the bubble.
            if (
              closedDraft &&
              closedId &&
              !draftHasVisibleParts(draft)
            ) {
              applyEvent(closedDraft, ev);
              flushDraft(closedDraft, closedId);
            } else {
              applyEvent(draft, ev);
              flush();
            }
            continue;
          }
          if (ev.type === "message-boundary") {
            // Spurious boundary before any visible content — ignore.
            if (!draftHasVisibleParts(draft)) {
              continue;
            }
            if (!draft.status || draft.status.type === "running") {
              draft.status = { type: "complete", reason: "stop" };
            }
            flush();
            closedDraft = draft;
            closedId = assistantId;
            assistantId = nextId("a");
            draft = freshDraft(assistantId);
            draft.status = { type: "running" };
            // Do not flush the empty post-boundary draft until it gains
            // visible parts — otherwise a timing-only bubble appears.
            continue;
          }

          // Fold turn-level metadata onto the previous bubble when the
          // current post-boundary draft is still empty.
          if (
            closedDraft &&
            closedId &&
            !draftHasVisibleParts(draft) &&
            isTurnLevelEvent(ev)
          ) {
            applyEvent(closedDraft, ev);
            flushDraft(closedDraft, closedId);
            continue;
          }

          applyEvent(draft, ev);
          // Error events flush and continue above. After a boundary, only
          // surface the new bubble once it has body parts. First bubble
          // always flushes (incl. running).
          if (!closedDraft || draftHasVisibleParts(draft)) {
            flush();
          }
        }

        if (draftHasVisibleParts(draft) || !closedDraft) {
          if (controller.signal.aborted) {
            draft.status = { type: "incomplete", reason: "cancelled" };
          } else if (!draft.status || draft.status.type === "running") {
            draft.status = { type: "complete", reason: "stop" };
          }
          flush();
        } else {
          // Empty trailing draft after a boundary — drop if it was ever
          // inserted; observability already folded onto closedDraft.
          dropDraftFromSession(assistantId);
        }

        void refreshThreads();
      } catch (err) {
        turnFailed = true;
        const errMsg = err instanceof Error ? err.message : String(err);
        draft.status = controller.signal.aborted
          ? { type: "incomplete", reason: "cancelled" }
          : { type: "incomplete", reason: "error", error: errMsg };
        // MessageError on the flushed draft — do not also set streamError.
        flush();
      } finally {
        unmarkThreadStreaming(threadId);
        refreshApprovalQueue();
        updateSession(threadId, (session) => ({
          ...session,
          streaming: false,
          abortController: null,
          activityText: session.cancellation === "pending" ? "Stopping…" : null,
          // A busy-thread refusal recorded during this turn is false once the
          // turn ends. Other stream errors survive so a rejected send can
          // still be read after the stream closes.
          streamError:
            session.streamError === THREAD_ALREADY_RESPONDING
              ? null
              : session.streamError,
          // `lastLoadedAt` is deliberately NOT stamped here. Stamping it
          // marked a thread whose history was never fetched as loaded, so a
          // send on a cold thread hid its transcript for good.
        }));
        const session = peekSessions()[threadId];
        if (
          provider.serverPersisted &&
          !threadId.startsWith("local-") &&
          (resumeWorkItemId || !session || session.lastLoadedAt === 0)
        ) {
          void loadThread(threadId);
        }
        // Navigation is a live, foreground UI effect. Never replay it from
        // history/recovery, interrupt a newer route, or move another chat.
        if (
          navigationMountedRef.current && navigationPath && !turnFailed && !controller.signal.aborted && !resumeWorkItemId &&
          activeThreadIdRef.current === threadId && workspaceIdRef.current === navigationWorkspace &&
          principalIdRef.current === navigationPrincipal &&
          document.visibilityState === "visible" &&
          window.location.pathname + window.location.search === navigationOrigin
        ) {
          const composing = [...document.querySelectorAll<HTMLTextAreaElement>('textarea[aria-label="Message input"]')]
            .some(input => Boolean(input.value.trim()));
          if (!composing) onNavigateRef.current?.(navigationPath, threadId);
        }
      }
    },
    [provider, nextId, refreshThreads, activeAgentId, updateSession, focusedTrackId, focusedViewId, focusedAppId, snapshotPageContext, admissionError, loadThread],
  );

  // A fresh page attaches to accepted work discovered from the owned thread.
  // Attempt once per WorkItem per mounted view; a failed connection leaves a
  // recoverable error rather than restarting work or spinning a retry loop.
  const recoveredWorkItemsRef = useRef(new Set<string>());
  useEffect(() => {
    if (provider.id !== "integral_native" || !activeThreadId || !selectionScopeReady) return;
    const session = sessions[activeThreadId];
    const workItemId = session?.activeWorkItemId;
    if (!workItemId || session.streaming || recoveredWorkItemsRef.current.has(workItemId)) return;
    if (peekStreamingThreadIds().length >= MAX_CONCURRENT_STREAMS) return;
    recoveredWorkItemsRef.current.add(workItemId);
    void streamAssistantTurn(activeThreadId, "", session.messages, undefined, undefined, undefined, undefined, workItemId);
  }, [provider.id, activeThreadId, selectionScopeReady, sessions, streamAssistantTurn]);

  /**
   * Return the active thread id, creating one if none exists yet — same
   * work `onNew` used to do inline. Extracted so the file attachment
   * adapter can create the thread too: assistant-ui resolves every pending
   * attachment's `send()` BEFORE calling `onNew`, so on the very first
   * message of a new conversation a file attachment used to hit a null
   * thread id and throw, silently aborting the whole send (Task B4
   * follow-up — "fresh chat ignores the attachment" regression).
   *
   * Concurrent callers (a multi-file send + `onNew` itself) share the same
   * in-flight creation via `threadCreationPromiseRef` so a fresh
   * conversation's first message never creates two threads.
   */
  const ensureThreadId = useCallback(async (): Promise<string> => {
    if (activeThreadIdRef.current) return activeThreadIdRef.current;
    if (threadCreationPromiseRef.current) return threadCreationPromiseRef.current;

    const promise = (async () => {
      if (!provider.serverPersisted) {
        const localId = `local-${nextId("thr")}`;
        activeThreadIdRef.current = localId;
        selectThread(localId);
        return localId;
      }
      const created = await aiChatApi.createThread(provider.id, {
        agentId: activeAgentId ?? undefined,
      });
      activeThreadIdRef.current = created.id;
      setThreads((prev) => [created, ...prev]);
      skipLoadForThreadIdRef.current = created.id;
      selectThread(created.id);
      return created.id;
    })();
    threadCreationPromiseRef.current = promise;
    try {
      return await promise;
    } finally {
      threadCreationPromiseRef.current = null;
    }
  }, [provider, activeAgentId, nextId, selectThread]);

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const userText =
        message.content
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("") || "";

      let threadId: string;
      try {
        threadId = await ensureThreadId();
      } catch (err) {
        console.error("AI chat: failed to create thread", err);
        return;
      }

      const refused = admissionError(threadId);
      if (refused) {
        // Say so instead of appending a message nothing will answer. The
        // composer keeps its text (and pending refs) for the retry.
        // "Already responding" is the exception: the thread is mid-reply, and
        // a red alert here reads as if that reply failed.
        if (refused !== THREAD_ALREADY_RESPONDING) {
          updateSession(threadId, (session) =>
            session.streamError === refused
              ? session
              : { ...session, streamError: refused },
          );
        }
        return;
      }

      const userId = nextId("u");
      const entityRefs = consumeEntityRefs?.();
      const parts = attachmentContentParts(message);
      const images = imagesFromContent(parts);
      const attachmentIds = attachmentIdsFromContent(parts);
      const userMsg = userMessageFromAppend(
        message,
        userId,
        entityRefs?.length ? entityRefs : undefined,
      );
      const priorMessages = [
        ...(peekSessions()[threadId]?.messages ?? messages),
        userMsg,
      ];
      updateSession(threadId, { messages: priorMessages });

      await streamAssistantTurn(
        threadId,
        userText,
        priorMessages,
        entityRefs?.length ? entityRefs : undefined,
        images.length ? images : undefined,
        attachmentIds.length ? attachmentIds : undefined,
      );
      resetComposerEntityRefs?.();
    },
    [
      nextId,
      ensureThreadId,
      messages,
      streamAssistantTurn,
      consumeEntityRefs,
      resetComposerEntityRefs,
      updateSession,
      admissionError,
    ],
  );

  const onEdit = useCallback(
    async (message: AppendMessage) => {
      const threadId = activeThreadId;
      if (!threadId) return;

      const editedText =
        message.content
          .map((p) => (p.type === "text" ? p.text : ""))
          .join("") || "";

      const userId = nextId("u");
      const userMsg: ThreadMessageLike = {
        id: userId,
        role: "user",
        content: [{ type: "text", text: editedText }],
      };

      const priorMessages = resolveEditTurn(
        messages,
        message.parentId,
        userMsg,
      );
      if (!priorMessages) return;
      updateSession(threadId, { messages: priorMessages });

      await streamAssistantTurn(threadId, editedText, priorMessages);
    },
    [activeThreadId, messages, nextId, streamAssistantTurn, updateSession],
  );

  const onReload = useCallback(
    async (
      parentId: string | null,
      config?: { runConfig?: { custom?: Record<string, unknown> } },
    ) => {
      const threadId = activeThreadId;
      if (!threadId) return;

      if (config?.runConfig?.custom?.hostAction === "prompt_sheet_resume") {
        const priorMessages = peekSessions()[threadId]?.messages ?? messages;
        await streamAssistantTurn(
          threadId,
          "",
          priorMessages,
          undefined,
          undefined,
          undefined,
          "prompt_sheet_resume",
        );
        return;
      }
      if (config?.runConfig?.custom?.hostAction === "staging_follow_through") {
        const priorMessages = peekSessions()[threadId]?.messages ?? messages;
        await streamAssistantTurn(
          threadId,
          "",
          priorMessages,
          undefined,
          undefined,
          undefined,
          "staging_follow_through",
        );
        return;
      }

      const ctx = resolveReloadTurn(messages, parentId);
      if (!ctx) return;

      updateSession(threadId, { messages: ctx.priorMessages });
      await streamAssistantTurn(threadId, ctx.userText, ctx.priorMessages);
    },
    [activeThreadId, messages, streamAssistantTurn, updateSession],
  );

  const onCancel = useCallback(async () => {
    const threadId = activeThreadId;
    if (!threadId || peekSessions()[threadId]?.cancellation === "pending") return;
    const controller = peekSessions()[threadId]?.abortController;
    const requestId = nextId("cancel");
    const remoteTurn = getRemoteTurnsSnapshot()[threadId];
    updateSession(threadId, { cancellation: "pending", cancellationRequestId: requestId,
      activityText: "Stopping…", streamError: null });
    const stillCurrent = () => peekSessions()[threadId]?.cancellationRequestId === requestId;
    try {
      if (provider.serverPersisted && !threadId.startsWith("local-")) {
        await aiChatApi.cancelThread(threadId, peekSessions()[threadId]?.cancellationTarget,
          target => { if (stillCurrent()) updateSession(threadId, { cancellationTarget: target }); });
      }
      if (!stillCurrent()) return;
      // Aborting only the SSE connection does not cancel durable backend work.
      controller?.abort();
      if (remoteTurn && getRemoteTurnsSnapshot()[threadId] === remoteTurn) {
        markRemoteTurnFinished(threadId, remoteTurn.turnId);
      }
      updateSession(threadId, (session) => ({
        ...session, cancellation: null, cancellationTarget: null, cancellationRequestId: null, activityText: null,
        messages: session.messages.map(message =>
          message.role === "assistant" && message.status?.type === "running"
            ? { ...message, status: { type: "incomplete", reason: "cancelled" } } : message),
      }));
      void refreshThreads();
    } catch (error) {
      if (!stillCurrent()) return;
      updateSession(threadId, { cancellation: "failed", activityText: null,
        streamError: error instanceof Error ? error.message : "I couldn't stop this request. Please try Stop again." });
    }
  }, [activeThreadId, provider.serverPersisted, updateSession, nextId, refreshThreads]);

  const switchToNewThread = useCallback(() => {
    // An explicit choice wins over an initial list request still in flight.
    initialAutoSelectDoneRef.current = true;
    rememberFreshChat(freshChatScope, true);
    rememberActiveChatThreadId(null, workspaceId);
    consumeChatHandoff();
    activeThreadIdRef.current = null;
    setActiveThreadId(null);
  }, [freshChatScope, workspaceId]);

  const threadListAdapter = useMemo<ExternalStoreThreadListAdapter>(() => {
    const regular = threads.filter((t) => !t.archived);
    const archived = threads.filter((t) => t.archived);
    return {
      threadId: activeThreadId ?? undefined,
      threads: regular.map((t) => ({
        status: "regular" as const,
        id: t.id,
        title: t.title || "New chat",
      })),
      archivedThreads: archived.map((t) => ({
        status: "archived" as const,
        id: t.id,
        title: t.title || "New chat",
      })),
      onSwitchToNewThread: async () => {
        // ``onNew`` may run in the same event turn as the switch.  React state
        // has not committed yet in that case, while ``ensureThreadId`` reads
        // this ref synchronously; leaving it set sends the first message of a
        // supposedly new conversation into the previous provider session.
        switchToNewThread();
      },
      onSwitchToThread: async (threadId: string) => {
        selectThread(threadId);
      },
      onRename: async (threadId: string, newTitle: string) => {
        try {
          await aiChatApi.renameThread(threadId, newTitle);
          await refreshThreads();
        } catch (err) {
          console.error("AI chat: rename failed", err);
          throw err;
        }
      },
      onArchive: async (threadId: string) => {
        try {
          await aiChatApi.archiveThread(threadId);
          if (activeThreadId === threadId) setActiveThreadId(null);
          await refreshThreads();
        } catch (err) {
          console.error("AI chat: archive failed", err);
        }
      },
      onDelete: async (threadId: string) => {
        try {
          await aiChatApi.deleteThread(threadId);
          if (activeThreadId === threadId) setActiveThreadId(null);
          await refreshThreads();
        } catch (err) {
          console.error("AI chat: delete failed", err);
        }
      },
    };
  }, [threads, activeThreadId, refreshThreads, switchToNewThread, selectThread]);

  // Composite: images retain vision content plus a persisted file identity; general
  // file branch (Slice B — uploads to the chat-upload endpoint at send()
  // time, creating the thread on demand via ensureThreadId if this is the
  // first message of a new conversation).
  const attachmentsAdapter = useMemo(
    () =>
      new CompositeAttachmentAdapter([
        createImageAttachmentAdapter(ensureThreadId),
        createFileAttachmentAdapter(ensureThreadId),
      ]),
    [ensureThreadId],
  );

  const setMessages = useCallback(
    (msgs: readonly ThreadMessageLike[]) => {
      if (!activeThreadId) return;
      updateSession(activeThreadId, (session) => {
        const stored = new Map(session.messages.map((message) => [message.id, message]));
        return {
          ...session,
          messages: msgs.map((message) => {
            const previous = stored.get(message.id);
            // assistant-ui can append using a snapshot from before Stop.
            // A terminal row must not become running again under the same ID;
            // a real retry creates a new draft with a new ID.
            return message.status?.type === "running" && previous?.status &&
              previous.status.type !== "running"
              ? { ...message, status: previous.status }
              : message;
          }),
        };
      });
    },
    [activeThreadId, updateSession],
  );

  const runtimeAdapters = useMemo(
    () => ({
      threadList: threadListAdapter,
      attachments: attachmentsAdapter,
    }),
    [threadListAdapter, attachmentsAdapter],
  );

  // The whole options object below MUST be referentially stable across
  // renders that change nothing meaningful — `ExternalStoreThreadRuntimeCore
  // .__internal_setAdapter` (assistant-ui core) only skips its
  // `_notifySubscribers()` call when `this._store === store` holds, and the
  // `useExternalStoreRuntime` wrapper re-runs `runtime.setAdapter(store)` in
  // a bare `useEffect` (no dependency array) on *every* render. An inline
  // object literal here — even with every field individually memoized —
  // is still a new object identity each render, so that early-return never
  // fires: every commit notifies the store's subscribers, which re-renders
  // this hook, which re-notifies — an infinite loop, surfaced as React's
  // "Maximum update depth exceeded. The result of getSnapshot should be
  // cached to avoid an infinite loop." on every page (the chat dock mounts
  // everywhere). See `identityConvertMessage` above for the other half of
  // this — a stable object with an unstable `convertMessage` loops too.
  const runtimeStore = useMemo(
    () => ({
      messages,
      setMessages,
      isRunning,
      onNew,
      onEdit,
      onReload,
      onCancel,
      convertMessage: identityConvertMessage,
      adapters: runtimeAdapters,
    }),
    [
      messages,
      setMessages,
      isRunning,
      onNew,
      onEdit,
      onReload,
      onCancel,
      runtimeAdapters,
    ],
  );

  const runtime = useExternalStoreRuntime<ThreadMessageLike>(runtimeStore);

  // Provider-side session id of the currently-active thread. This is
  // the same key cockpit-side staging tokens carry as ``session_id``.
  // Exposed for future per-thread scoping needs; no active consumer
  // right now (inline staged-change cards render from tool-call parts
  // in the thread's message list, which is already thread-scoped).
  const activeProviderSessionId =
    threads.find((t) => t.id === activeThreadId)?.provider_session_id ?? null;

  // Recency buckets (Today / Yesterday / Previous 7 days / …) for the
  // conversations rail. Computed from the same recent-first order the thread
  // list renders (regular threads by ``last_message_at`` desc), so each row can
  // draw its group header when it is first in its bucket. See threadGrouping.ts.
  const threadGroups = useMemo(() => {
    const ordered = threads
      .filter((t) => !t.archived)
      .map((t) => {
        const raw = t.last_message_at ?? t.updated_at ?? t.created_at;
        const ms = raw ? new Date(raw).getTime() : null;
        return { id: t.id, ts: ms != null && !Number.isNaN(ms) ? ms : null };
      });
    return groupThreadsByRecency(ordered, Date.now());
  }, [threads]);

  return useMemo(
    () => ({
      runtime,
      provider,
      threads,
      threadGroups,
      activeThreadId,
      composerReady,
      activeProviderSessionId,
      activityText,
      isRunning,
      streamError,
      streamingThreadIds,
      remoteTurns,
      isThreadStreaming,
      appendAssistantNote,
      switchToThread: selectThread,
      switchToNewThread,
    }),
    [
      runtime,
      provider,
      threads,
      threadGroups,
      switchToNewThread,
      selectThread,
      activeThreadId,
      composerReady,
      activeProviderSessionId,
      activityText,
      isRunning,
      streamError,
      streamingThreadIds,
      remoteTurns,
      isThreadStreaming,
      appendAssistantNote,
    ],
  );
}

function applyEvent(draft: AssistantMessageDraft, ev: NormalizedEvent) {
  switch (ev.type) {
    case "text-replace":
      draft.textParts = [completeCutDesignInvitation(ev.content)];
      return;
    case "text-delta":
      draft.textParts.push(ev.delta);
      return;
    case "reasoning-delta": {
      const seg = ev.segmentId ?? "default";
      if (!draft.reasoningSegments.has(seg)) draft.reasoningOrder.push(seg);
      const prev = draft.reasoningSegments.get(seg) ?? "";
      draft.reasoningSegments.set(seg, prev + ev.delta);
      return;
    }
    case "tool-call": {
      if (!draft.toolCalls.has(ev.toolCallId))
        draft.toolCallOrder.push(ev.toolCallId);
      const existing = draft.toolCalls.get(ev.toolCallId);
      draft.toolCalls.set(ev.toolCallId, {
        name: ev.name,
        args: ev.args ?? existing?.args,
        result: ev.result ?? existing?.result,
        diagnostic: ev.diagnostic ?? existing?.diagnostic,
        isError: ev.status === "error" || existing?.isError,
        status: ev.status,
      });
      return;
    }
    case "source":
      draft.sources.push({
        type: ev.sourceType,
        ref: ev.ref,
        title: ev.title,
      });
      return;
    case "step": {
      const customUsage = ev.usage
        ? {
            ...(ev.usage.inputTokens != null
              ? { inputTokens: ev.usage.inputTokens }
              : {}),
            ...(ev.usage.outputTokens != null
              ? { outputTokens: ev.usage.outputTokens }
              : {}),
          }
        : undefined;
      const usage =
        customUsage?.inputTokens != null && customUsage.outputTokens != null
          ? {
              inputTokens: customUsage.inputTokens,
              outputTokens: customUsage.outputTokens,
            }
          : undefined;
      draft.steps = [
        ...(draft.steps ?? []),
        { messageId: draft.id, usage },
      ];
      draft.customSteps = [
        ...(draft.customSteps ?? []),
        {
          modelId: ev.modelId,
          provider: ev.provider,
          providerCostUsd: ev.providerCostUsd,
          costSource: ev.costSource,
          durationMs: ev.durationMs,
          outcome: ev.outcome,
          attempt: ev.attempt,
          requestId: ev.requestId,
          finishReason: ev.finishReason,
          usageComplete: ev.usageComplete,
          inputTokensReported: ev.inputTokensReported,
          outputTokensReported: ev.outputTokensReported,
          costComplete: ev.costComplete,
          usage: customUsage,
        },
      ];
      return;
    }
    case "message-finish":
      if (ev.timing) {
        draft.timing = {
          streamStartTime: 0,
          firstTokenTime: ev.timing.firstTokenMs,
          totalStreamTime: ev.timing.totalMs,
          tokensPerSecond: ev.timing.tps,
          tokenCount:
            draft.steps?.reduce(
              (sum, step) => sum + (step.usage?.outputTokens ?? 0),
              0,
            ) ?? 0,
          totalChunks: draft.textParts.length,
          toolCallCount: draft.toolCallOrder.length,
        };
      }
      // Don't downgrade an already-failed turn. If an earlier `error`
      // event marked the draft incomplete, leaving that status is the
      // correct UX — a trailing `message-finish` that arrives after an
      // error event should still preserve the failure state. Only
      // transition to "complete" when the draft is still mid-stream
      // (running) or has no status yet.
      if (!draft.status || draft.status.type === "running") {
        draft.status = { type: "complete", reason: "stop" };
      }
      return;
    case "interact-context":
      draft.interactPayload = ev.payload;
      return;
    case "final-content":
      if (ev.content) {
        // The provider's settled answer is authoritative. Streaming deltas
        // are provisional and may be truncated or formatted differently by
        // a provider; keeping them in the visible transcript while recording
        // the final answer only in debug metadata made the two surfaces
        // disagree. Reconcile at the provider-neutral event boundary.
        const settled = completeCutDesignInvitation(ev.content);
        draft.finalContent = settled;
        if (draft.textParts.join("") !== settled) {
          draft.textParts = [settled];
        }
      }
      if (ev.payload !== undefined) draft.finalPayload = ev.payload;
      return;
    case "status":
      return;
    case "message-boundary":
      // Bubble splitting is handled in streamAssistantTurn's loop (it flushes
      // the current draft and starts a new one). No-op here so it doesn't fall
      // through to the unknown-type warning.
      return;
    case "error":
      draft.errorCode = ev.code;
      draft.errorDetail = ev.message;
      draft.status = ev.code === "work.cancelled"
        ? { type: "incomplete", reason: "cancelled" }
        : {
            type: "incomplete",
            reason: "error",
            error: friendlyChatFailure(ev.code, ev.message),
          };
      return;
    default: {
      // Unknown event type — surface in devtools so newly-shipped
      // native provider event types don't silently vanish. The translator
      // emits side-channel envelopes (e.g. `_meta`) that the backend
      // strips before sending to the client; anything reaching this
      // path is genuinely unrecognised.
      const unknown = ev as { type?: unknown };
      if (typeof unknown?.type === "string" && !unknown.type.startsWith("_")) {
        console.warn(
          "[ai-chat] unknown stream event dropped",
          unknown.type,
          ev,
        );
      }
      return;
    }
  }
}
