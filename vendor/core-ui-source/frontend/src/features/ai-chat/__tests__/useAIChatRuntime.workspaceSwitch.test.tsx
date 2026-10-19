/**
 * A workspace switch must not kill work the user started.
 *
 * The old reset ran `setSessions({}) + abortAllStreams()` on every
 * `workspaceId` change, aborting every in-flight stream regardless of which
 * workspace it belonged to — so glancing at another workspace destroyed a
 * turn you were waiting on. It was also unguarded against the first
 * resolution (`null -> ws:X`), so a runtime that mounted before scope
 * resolved wiped itself immediately.
 *
 * None of that was covered by a test, which is why it survived so long.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useAIChatRuntime } from "../useAIChatRuntime";
// Stream state is module-level now, so it survives between cases unless
// explicitly cleared — without this, ids collide across tests.
import { __resetThreadSessionStoreForTests } from "../threadSessionStore";
import type { ChatProvider, NormalizedEvent } from "../providers/types";

/** Mutable so a test can drive a scope change between renders. */
const scopeState: { workspaceId: string | null } = { workspaceId: "ws1" };

vi.mock("../../../context/ScopeContext", () => ({
  useScope: () => ({ scope: { workspaceId: scopeState.workspaceId } }),
}));

vi.mock("../useAgentCatalog", () => ({
  useAgentCatalog: () => ({ activeAgent: { id: "agent1", name: "Agent" } }),
}));

vi.mock("../../../context/ChatPageFocusContext", () => ({
  useChatPageFocus: () => ({
    focusedTrackId: null,
    focusedViewId: null,
    focusedAppId: null,
    pageKind: null,
    focusedEntryId: null,
    visibleData: null,
    metadata: null,
    setPageFocus: vi.fn(),
    clearPageFocus: vi.fn(),
    setPageContext: vi.fn(),
    clearPageContext: vi.fn(),
  }),
}));

vi.mock("../useChatPageContextSnapshot", () => ({
  useChatPageContextSnapshot: () => () => ({ url: "/", route_path: "/" }),
}));

vi.mock("../../../api/aiChat", () => ({
  aiChatApi: {
    listThreads: vi.fn(async () => []),
    getThread: vi.fn(async (id: string) => ({
      id,
      provider_id: "mock",
      agent_id: "agent1",
      title: "Test",
      archived: false,
      messages: [],
    })),
    createThread: vi.fn(),
    cancelThread: vi.fn(async () => ({ thread_id: "t1", cancelled: true })),
  },
}));

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function* slowStream(
  _threadId: string,
  signal?: AbortSignal,
): AsyncIterable<NormalizedEvent> {
  yield { type: "text-delta", delta: "Hello" };
  for (let i = 0; i < 40; i++) {
    if (signal?.aborted) return;
    await delay(25);
  }
  yield { type: "text-delta", delta: " world" };
  yield {
    type: "message-finish",
    timing: { firstTokenMs: 1, totalMs: 2, tps: 1 },
  };
}

const mockProvider: ChatProvider = {
  id: "mock",
  label: "Mock",
  serverPersisted: false,
  capabilities: {
    reasoning: false,
    tools: false,
    attachments: false,
    vision: false,
    voice: false,
  },
  streamTurn: ({ threadId, abortSignal }) => slowStream(threadId, abortSignal),
  listAgents: async () => [],
};

async function startTurn(result: { current: ReturnType<typeof useAIChatRuntime> }) {
  await act(async () => {
    await result.current.runtime.thread.append({
      role: "user",
      content: [{ type: "text", text: "hi" }],
    });
  });
  return result.current.activeThreadId;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetThreadSessionStoreForTests();
  scopeState.workspaceId = "ws1";
});

describe("workspace switch", () => {
  it("leaves an in-flight stream running", async () => {
    const { result, rerender } = renderHook(() => useAIChatRuntime(mockProvider));
    const threadA = await startTurn(result);
    expect(result.current.streamingThreadIds).toContain(threadA);

    await act(async () => {
      scopeState.workspaceId = "ws2";
      rerender();
      await delay(0);
    });

    // The whole point: a scope change is a change of view, not a reason to
    // destroy work.
    expect(result.current.streamingThreadIds).toContain(threadA);
  });

  it("keeps the streaming transcript so returning finds it intact", async () => {
    const { result, rerender } = renderHook(() => useAIChatRuntime(mockProvider));
    const threadA = await startTurn(result);

    await act(async () => {
      scopeState.workspaceId = "ws2";
      rerender();
      await delay(0);
    });

    // Asserted synchronously, with no waitFor: the in-flight stream keeps
    // writing, so waiting lets it rebuild a session the switch had wiped and
    // the test passes either way. The cache has to survive the switch itself.
    await act(async () => {
      if (threadA) result.current.switchToThread(threadA);
    });
    const msgs = result.current.runtime.thread.getState().messages;
    const assistant = msgs.find((m) => m.role === "assistant");
    const textPart = (
      assistant?.content as Array<{ type: string; text?: string }>
    )?.find((p) => p.type === "text");
    expect(textPart?.text).toContain("Hello");
  });

  it("clears the open thread so the previous workspace stops showing", async () => {
    const { result, rerender } = renderHook(() => useAIChatRuntime(mockProvider));
    await startTurn(result);
    expect(result.current.activeThreadId).toBeTruthy();

    await act(async () => {
      scopeState.workspaceId = "ws2";
      rerender();
      await delay(0);
    });

    expect(result.current.activeThreadId).toBeNull();
  });

  it("does not re-select a `?thread=` deep link from the previous workspace", async () => {
    // Effect ordering made this happen: the thread-load effect starts its
    // fetch before the switch effect resets `initialAutoSelectDoneRef`, so
    // when the list resolved the guard was down and `initialThreadId` — a
    // thread from the workspace just left — was applied again.
    const persistedProvider: ChatProvider = {
      ...mockProvider,
      id: "persisted",
      serverPersisted: true,
    };
    const { result, rerender } = renderHook(() =>
      useAIChatRuntime(persistedProvider, { initialThreadId: "t-from-ws1" }),
    );
    await waitFor(() => expect(result.current.activeThreadId).toBe("t-from-ws1"));

    await act(async () => {
      scopeState.workspaceId = "ws2";
      rerender();
      await delay(0);
    });
    // Let the refreshed (empty) list settle, which is when the stale id used
    // to come back.
    await act(async () => {
      await delay(20);
    });

    expect(result.current.activeThreadId).toBeNull();
  });

  it("treats the first scope resolution as a mount, not a switch", async () => {
    // The runtime can mount before scope resolves. Counting `null -> ws:X` as
    // a switch wiped state the moment scope arrived.
    scopeState.workspaceId = null;
    const { result, rerender } = renderHook(() => useAIChatRuntime(mockProvider));
    const threadA = await startTurn(result);
    expect(result.current.streamingThreadIds).toContain(threadA);

    await act(async () => {
      scopeState.workspaceId = "ws1";
      rerender();
      await delay(0);
    });

    expect(result.current.streamingThreadIds).toContain(threadA);
    expect(result.current.activeThreadId).toBe(threadA);
  });
});
