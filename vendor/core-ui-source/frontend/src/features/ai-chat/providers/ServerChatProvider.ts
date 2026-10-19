import { aiChatApi } from "../../../api/aiChat";
import { getActiveScopeHeader } from "../../../api/client";
import { getAccessToken, refreshAccessToken } from "../../../api/session";
import { getApiBaseURL } from "../../../config";
import { randomUUID } from "../../../utils/randomUUID";
import type { ChatProvider, NormalizedEvent, TurnContext } from "./types";

const SCOPE_KEY = "integral.scope";

/** Read the persisted workspace scope and serialise it as the header
 *  value the backend dispatcher expects. Returns null when the slot is
 *  empty / corrupt — caller omits the header in that case. */
function readScopeHeader(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SCOPE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // W6 canonical shape: { workspaceId: string }
    if (parsed?.workspaceId && typeof parsed.workspaceId === "string") {
      return `ws:${parsed.workspaceId}`;
    }
  } catch {
    /* corrupt slot — fall through */
  }
  return null;
}

/**
 * Parses a server-sent-events payload incrementally and yields parsed JSON
 * objects (one per event block). Stops cleanly when the stream ends or the
 * abort signal fires.
 */
async function* readSseEvents(
  response: Response,
  signal: AbortSignal,
): AsyncIterable<{ event: string; data: unknown; id?: string }> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamEnded = false;
  try {
    while (true) {
      if (signal.aborted) break;
      const { done, value } = await reader.read();
      if (done) {
        streamEnded = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let sepIdx: number;
      while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sepIdx);
        buffer = buffer.slice(sepIdx + 2);
        const parsed = parseSseBlock(block);
        if (parsed) yield parsed;
      }
    }
    if (buffer.trim().length > 0) {
      const parsed = parseSseBlock(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    // A turn-settled frame ends the application protocol before the transport
    // necessarily closes. Cancel the reader on early completion/abort so the
    // browser releases the response body and its connection resources.
    if (!streamEnded) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

function parseSseBlock(block: string): { event: string; data: unknown; id?: string } | null {
  let event = "message";
  let id: string | undefined;
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("id:")) id = line.slice(3).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join("\n");
  try {
    return { event, data: JSON.parse(raw), id };
  } catch {
    return { event, data: raw, id };
  }
}

export function createServerChatProvider({
  id,
  label,
  capabilities,
}: Pick<ChatProvider, "id" | "label" | "capabilities">): ChatProvider {
  return {
  id,
  label,
  serverPersisted: true,
  capabilities,

  async listAgents() {
    return aiChatApi.listAgents(id);
  },

  async *streamTurn(ctx: TurnContext): AsyncIterable<NormalizedEvent> {
    if (!ctx.threadId) {
      yield {
        type: "error",
        code: "missing_thread_id",
        message: "No active chat thread.",
      };
      return;
    }

    // Forward the active workspace scope so native provider's tool calls are constrained
    // to the workspace the user is looking at. Prefer the LIVE in-memory header
    // (getActiveScopeHeader, kept in sync by ScopeContext from /users/me/scope) —
    // it is correct on a fresh boot. The localStorage slot is only written on an
    // explicit switch and is null until then, which silently fell the agent back
    // to the personal workspace even when the user was in an org workspace.
    const scopeHeader = getActiveScopeHeader() ?? readScopeHeader();
    // One opaque identity belongs to this logical send. Keep it outside
    // doFetch so an authentication refresh replays the same request ID.
    let clientRequestId: string;
    try {
      clientRequestId = randomUUID();
    } catch (err) {
      yield {
        type: "error",
        code: "request_id_unavailable",
        message: err instanceof Error ? err.message : String(err),
      };
      return;
    }
    const resumeWorkItemId = id === "integral_native" ? ctx.resumeWorkItemId : undefined;

    // This stream is a raw fetch (SSE), so it does NOT pass through the axios
    // client's 401 → refresh → retry interceptor the rest of the app relies on.
    // It also used to read the token straight out of localStorage. The result
    // was that an access token expiring mid-session surfaced as a chat error
    // with no refresh attempt, while every other surface silently recovered —
    // the user just saw the assistant stop working until they reloaded.
    //
    // Mirror the interceptor's contract here: try once, and on a 401 exchange
    // the refresh token (single-flight, shared with the interceptor via
    // api/session) and replay the request exactly once. `refreshAccessToken`
    // owns the failure semantics — 4xx tears the session down and emits
    // `integral:logout`, 5xx leaves tokens alone for a later retry — so a null
    // return here means "genuinely unauthenticated", not "try again".
    const doFetch = (bearer: string | null): Promise<Response> =>
      fetch(
        resumeWorkItemId
          ? `${getApiBaseURL()}/chat/threads/${encodeURIComponent(ctx.threadId!)}/work-items/${encodeURIComponent(resumeWorkItemId)}/stream?after_sequence=0`
          : `${getApiBaseURL()}/chat/threads/${encodeURIComponent(ctx.threadId!)}/messages`,
        {
          method: resumeWorkItemId ? "GET" : "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
            ...(scopeHeader ? { "X-Integral-Scope": scopeHeader } : {}),
          },
          body: resumeWorkItemId ? undefined : JSON.stringify({
            client_request_id: clientRequestId,
            text: ctx.userMessageText,
            agent_id: ctx.agentId ?? null,
            entity_refs: ctx.entityRefs?.length ? ctx.entityRefs : undefined,
            images: ctx.images?.length ? ctx.images : undefined,
            attachment_ids: ctx.attachmentIds?.length ? ctx.attachmentIds : undefined,
            focused_track_id: ctx.focusedTrackId ?? undefined,
            focused_view_id: ctx.focusedViewId ?? undefined,
            focused_space_id: ctx.focusedAppId ?? undefined,
            page_context: ctx.pageContext ?? undefined,
            host_action: ctx.hostAction ?? undefined,
          }),
          signal: ctx.abortSignal,
        },
      );

    let response: Response;
    try {
      response = await doFetch(getAccessToken());
      if (response.status === 401) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          response = await doFetch(refreshed);
        }
      }
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return;
      yield {
        type: "error",
        code: "network",
        message: err instanceof Error ? err.message : String(err),
      };
      return;
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      // Conflicts include admission, recovery and submission authority. Only
        // an explicit thread_busy reason means another response is running.
        if (response.status === 409) {
          // Two different conflicts arrive as 409 and want different things from
          // the user: this thread is busy (wait or stop THIS one), or too many
          // of their conversations are running at once (stop ANY one). The
          // backend distinguishes them in `details.reason`; telling someone to
          // stop a thread that is not the problem sends them the wrong way.
          let reason = "";
          let serverMessage = "";
          try {
            const parsed = JSON.parse(body) as {
              message?: unknown;
              details?: { reason?: unknown };
            };
            reason =
              typeof parsed.details?.reason === "string"
                ? parsed.details.reason
                : "";
            serverMessage =
              typeof parsed.message === "string" ? parsed.message.trim() : "";
          } catch {
            /* non-JSON envelope — use a generic conflict sentence */
          }
          yield {
            type: "error",
            code:
              reason === "thread_busy"
                ? "turn_in_flight"
                : reason === "user_turn_limit"
                  ? "user_turn_limit"
                  : "http_409",
            message:
              reason === "thread_busy"
                ? "This conversation is already responding. Wait for it to finish, or stop it first."
                : serverMessage ||
                  "This request conflicts with the current conversation state. Please review it before retrying.",
          };
          return;
        }
        // Every other failure: say the server's own sentence when the
      // envelope carries one, otherwise a human line with the status. The raw
      // JSON envelope used to be rendered verbatim as the assistant's reply.
      let serverMessage = "";
      try {
        const parsed = JSON.parse(body) as { message?: unknown };
        if (typeof parsed?.message === "string") serverMessage = parsed.message.trim();
      } catch {
        /* non-JSON body — use the generic sentence */
      }
      yield {
        type: "error",
        code: `http_${response.status}`,
        message:
          serverMessage ||
          `The assistant could not process this request (HTTP ${response.status}). Please try again.`,
      };
      return;
    }

    // Only an accepted native WorkItem permits replay. Legacy responses keep
    // their existing transport behavior; reconnect is always GET, never POST.
    const workItemId = id === "integral_native"
      ? resumeWorkItemId ?? response.headers.get("X-Integral-Work-Item")
      : null;
    let committedCursor = 0;
    let reconnects = 0;
    while (!ctx.abortSignal.aborted) {
      let deliveryError: unknown;
      try {
        for await (const ev of readSseEvents(response, ctx.abortSignal)) {
          if (ctx.abortSignal.aborted) return;
          if (ev.event === "turn-settled") return;
          if (ev.event === "turn-accepted") continue;
          if (workItemId && ev.id === undefined && ev.event !== "error") {
            yield { type: "error", code: "chat_event_sequence_invalid",
              message: "The saved response needs reconciliation. Reload this conversation." };
            return;
          }
          if (workItemId && ev.id !== undefined) {
            const sequence = Number(ev.id);
            if (!/^[1-9]\d*$/.test(ev.id) || !Number.isSafeInteger(sequence)) {
              yield { type: "error", code: "chat_event_sequence_invalid",
                message: "The saved response needs reconciliation. Reload this conversation." };
              return;
            }
            if (sequence <= committedCursor) continue;
            if (sequence !== committedCursor + 1) {
              yield { type: "error", code: "chat_event_sequence_gap",
                message: "The saved response needs reconciliation. Reload this conversation." };
              return;
            }
            committedCursor = sequence;
          }
          const payload = ev.data;
          if (payload && typeof payload === "object") yield payload as NormalizedEvent;
        }
      } catch (err) {
        if (ctx.abortSignal.aborted || (err as DOMException)?.name === "AbortError") return;
        deliveryError = err;
      }
      if (!workItemId) {
        if (deliveryError) yield {
          type: "error", code: "stream_read_failed",
          message: deliveryError instanceof Error ? deliveryError.message : String(deliveryError),
        };
        return;
      }
      if (ctx.abortSignal.aborted) return;
      if (reconnects++ >= 3) {
        yield { type: "error", code: "chat_reconnect_exhausted",
          message: "Connection interrupted. Your request is saved; reload this conversation to recover its response." };
        return;
      }
      const fetchReplay = (bearer: string | null) => fetch(
        `${getApiBaseURL()}/chat/threads/${encodeURIComponent(ctx.threadId!)}/work-items/${encodeURIComponent(workItemId)}/stream?after_sequence=${committedCursor}`,
        { method: "GET", headers: {
          Accept: "text/event-stream",
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          ...(scopeHeader ? { "X-Integral-Scope": scopeHeader } : {}),
        }, signal: ctx.abortSignal },
      );
      try {
        response = await fetchReplay(getAccessToken());
        if (response.status === 401) {
          const refreshed = await refreshAccessToken();
          if (refreshed) response = await fetchReplay(refreshed);
        }
        if (!response.ok) {
          yield { type: "error", code: `chat_reconnect_http_${response.status}`,
            message: "The saved response could not be recovered. Reload this conversation." };
          return;
        }
      } catch (err) {
        if (ctx.abortSignal.aborted || (err as DOMException)?.name === "AbortError") return;
        // Retry delivery from the same cursor, retaining the accepted receipt.
        response = new Response(null);
      }
    }
  },
  };
}
