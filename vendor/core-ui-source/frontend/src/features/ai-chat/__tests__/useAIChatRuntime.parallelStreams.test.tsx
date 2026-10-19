import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import { useAIChatRuntime } from "../useAIChatRuntime";
// Stream state is module-level now, so it survives between cases unless
// explicitly cleared — without this, ids collide across tests.
import { __resetThreadSessionStoreForTests } from "../threadSessionStore";
import type { ChatProvider, NormalizedEvent } from "../providers/types";

vi.mock("../../../context/ScopeContext", () => ({
  useScope: () => ({ scope: { workspaceId: "ws1" } }),
}));

vi.mock("../useAgentCatalog", () => ({
  useAgentCatalog: () => ({
    activeAgent: { id: "agent1", name: "Agent" },
  }),
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
  useChatPageContextSnapshot: () => () => ({
    url: "/",
    route_path: "/",
  }),
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

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function* slowStream(
  _threadId: string,
  signal?: AbortSignal,
): AsyncIterable<NormalizedEvent> {
  yield { type: "text-delta", delta: "Hello" };
  for (let i = 0; i < 20; i++) {
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

const settledAnswer =
  "The [Smoke Test App](/apps/a1) contains one track:\n\n- **[Smoke Test Track](/tracks/t1)** - Browser smoke fixture.";

async function* truncatedThenSettledStream(): AsyncIterable<NormalizedEvent> {
  yield { type: "text-delta", delta: "The [Smoke Test App](/apps/a1) contains" };
  yield { type: "final-content", content: settledAnswer };
  yield { type: "message-finish" };
}

const truncatedThenSettledProvider: ChatProvider = {
  ...mockProvider,
  streamTurn: () => truncatedThenSettledStream(),
};

describe("useAIChatRuntime parallel streams", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetThreadSessionStoreForTests();
  });

  it("keeps background thread cache warm when switching tabs mid-stream", async () => {
    const { result } = renderHook(() => useAIChatRuntime(mockProvider));

    await act(async () => {
      await result.current.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "hi" }],
      });
    });

    const threadA = result.current.activeThreadId;
    expect(threadA).toBeTruthy();

    await act(async () => {
      result.current.switchToNewThread();
    });

    await act(async () => {
      await result.current.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "second" }],
      });
    });

    const threadB = result.current.activeThreadId;
    expect(threadB).toBeTruthy();
    expect(threadB).not.toBe(threadA);

    expect(result.current.streamingThreadIds).toContain(threadA);
    expect(result.current.streamingThreadIds).toContain(threadB);

    await act(async () => {
      if (threadA) result.current.switchToThread(threadA);
    });

    await waitFor(() => {
      const msgs = result.current.runtime.thread.getState().messages;
      const assistant = msgs.find((m) => m.role === "assistant");
      expect(assistant).toBeDefined();
      const textPart = (
        assistant?.content as Array<{ type: string; text?: string }>
      )?.find((p) => p.type === "text");
      expect(textPart?.text).toContain("Hello");
    });
  });

  it("cancel on active thread does not abort other streaming threads", async () => {
    const { result } = renderHook(() => useAIChatRuntime(mockProvider));

    await act(async () => {
      await result.current.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "first" }],
      });
    });
    const threadA = result.current.activeThreadId!;

    await act(async () => {
      result.current.switchToNewThread();
    });

    await act(async () => {
      await result.current.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "second" }],
      });
    });
    const threadB = result.current.activeThreadId!;

    await act(async () => {
      await result.current.runtime.thread.cancelRun();
      // One tick for the aborted stream's `finally` to unmark itself.
      await delay(30);
    });

    // Asserted directly rather than through `waitFor`: polling waits long
    // enough for thread A's own stream to finish on its own, at which point
    // the assertion passes for the wrong reason (or fails, once state
    // propagates promptly). The claim is about the instant after cancel —
    // B stopped, A did not.
    expect(result.current.streamingThreadIds).not.toContain(threadB);
    expect(result.current.streamingThreadIds).toContain(threadA);
    expect(result.current.runtime.thread.getState().messages.find(
      (message) => message.role === "assistant",
    )?.status).toEqual({ type: "incomplete", reason: "cancelled" });
  });

  it("settles an empty cancelled draft before a follow-up captures the transcript", async () => {
    const emptyProvider: ChatProvider = {
      ...mockProvider,
      streamTurn: async function* ({ abortSignal }) {
        yield { type: "status", text: "Working" };
        while (!abortSignal?.aborted) await delay(5);
      },
    };
    const { result } = renderHook(() => useAIChatRuntime(emptyProvider));
    await act(async () => {
      await result.current.runtime.thread.append({
        role: "user", content: [{ type: "text", text: "first" }],
      });
    });
    // assistant-ui publishes its external-store snapshot asynchronously;
    // cancelRun is ignored before that snapshot reports a running turn.
    await waitFor(() => expect(result.current.runtime.thread.getState().isRunning).toBe(true));
    await act(async () => {
      await result.current.runtime.thread.cancelRun();
    });
    await waitFor(() => expect(result.current.runtime.thread.getState().messages.find(
      (message) => message.role === "assistant",
    )?.status).toEqual({ type: "incomplete", reason: "cancelled" }));
    await act(async () => {
      await result.current.runtime.thread.append({
        role: "user", content: [{ type: "text", text: "follow up" }],
      });
    });
    expect(result.current.runtime.thread.getState().messages.filter(
      (message) => message.role === "assistant",
    )[0]?.status).toEqual({ type: "incomplete", reason: "cancelled" });
    await act(async () => { await result.current.runtime.thread.cancelRun(); });
  });

  it("renders the authoritative final answer when streamed text is truncated", async () => {
    const { result } = renderHook(() =>
      useAIChatRuntime(truncatedThenSettledProvider),
    );

    await act(async () => {
      await result.current.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "What is in the app?" }],
      });
    });

    const assistant = result.current.runtime.thread
      .getState()
      .messages.find((message) => message.role === "assistant");
    const textPart = (
      assistant?.content as Array<{ type: string; text?: string }>
    )?.find((part) => part.type === "text");

    expect(textPart?.text).toBe(settledAnswer);
    expect(textPart?.text).toContain("Smoke Test Track");
    expect(assistant?.metadata?.custom).toMatchObject({
      finalContent: settledAnswer,
    });
  });
});

/**
 * What the shared store buys: the runtime is a *view* over stream state, not
 * its owner. Closing the dock, opening `/agent`, or switching provider all
 * destroy a runtime instance — and used to destroy the turn with it.
 */
describe("stream state survives the runtime instance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetThreadSessionStoreForTests();
  });

  it("keeps an in-flight turn alive across unmount and remount", async () => {
    const first = renderHook(() => useAIChatRuntime(mockProvider));
    await act(async () => {
      await first.result.current.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "hi" }],
      });
    });
    const threadId = first.result.current.activeThreadId!;
    expect(first.result.current.streamingThreadIds).toContain(threadId);

    // The dock closing, or a route change to /agent.
    first.unmount();

    const second = renderHook(() => useAIChatRuntime(mockProvider));
    await act(async () => {
      await delay(0);
    });

    // A fresh instance sees the turn the old one started.
    expect(second.result.current.streamingThreadIds).toContain(threadId);
  });

  it("shows the partial transcript to a second concurrent runtime", async () => {
    // The dock and /agent can be mounted in sequence over the same thread;
    // they used to hold separate caches of it.
    const dock = renderHook(() => useAIChatRuntime(mockProvider));
    await act(async () => {
      await dock.result.current.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "hi" }],
      });
    });
    const threadId = dock.result.current.activeThreadId!;

    const page = renderHook(() => useAIChatRuntime(mockProvider));
    await act(async () => {
      page.result.current.switchToThread(threadId);
      await delay(0);
    });

    const msgs = page.result.current.runtime.thread.getState().messages;
    const assistant = msgs.find((m) => m.role === "assistant");
    const textPart = (
      assistant?.content as Array<{ type: string; text?: string }>
    )?.find((p) => p.type === "text");
    expect(textPart?.text).toContain("Hello");
  });
});
