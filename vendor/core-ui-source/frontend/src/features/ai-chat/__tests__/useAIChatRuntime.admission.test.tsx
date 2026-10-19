/**
 * Two things `onNew` used to do silently.
 *
 *  1. A turn refused at the door — the concurrent-stream cap, or a thread
 *     already answering (locally or on another tab) — appended the user's
 *     message and then dropped the turn with a console.warn. The message sat
 *     there unanswered with no explanation.
 *  2. A send on a cold thread (history not yet fetched) stamped the thread
 *     as loaded when the stream ended, so its transcript never arrived.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  useAIChatRuntime,
  mergeColdTranscript,
  completeCutDesignInvitation,
} from "../useAIChatRuntime";
import {
  __resetThreadSessionStoreForTests,
  markRemoteTurnStarted,
} from "../threadSessionStore";
import { MAX_CONCURRENT_STREAMS } from "../threadSessionRegistry";
import type { ChatProvider, NormalizedEvent } from "../providers/types";

vi.mock("../../../context/AuthContext", () => ({
  useAuthOptional: () => ({ user: { id: "user1" }, loading: false }),
}));

vi.mock("../../../context/ScopeContext", () => ({
  useScope: () => ({ scope: { workspaceId: "ws1" } }),
}));

const catalog = vi.hoisted(() => ({ agentId: "agent1" as string | null }));
vi.mock("../useAgentCatalog", () => ({
  useAgentCatalog: () => ({ activeAgent: catalog.agentId ? { id: catalog.agentId, name: "Agent" } : null }),
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

const history = {
  id: "t-cold",
  provider_id: "persisted",
  agent_id: "agent1",
  title: "Cold",
  archived: false,
  messages: [
    { id: "h1", role: "user", parts: [{ type: "text", text: "earlier question" }] },
    { id: "h2", role: "assistant", parts: [{ type: "text", text: "earlier answer" }] },
  ],
};

vi.mock("../../../api/aiChat", () => ({
  aiChatApi: {
    listThreads: vi.fn(async () => []),
    getThread: vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return history;
    }),
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
  for (let i = 0; i < 4; i++) {
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

const persistedProvider: ChatProvider = {
  ...mockProvider,
  id: "persisted",
  serverPersisted: true,
};

function texts(result: { current: ReturnType<typeof useAIChatRuntime> }) {
  return result.current.runtime.thread.getState().messages.map((m) =>
    (m.content as Array<{ type: string; text?: string }>)
      .map((p) => (p.type === "text" ? p.text ?? "" : ""))
      .join(""),
  );
}

async function send(
  result: { current: ReturnType<typeof useAIChatRuntime> },
  text: string,
) {
  await act(async () => {
    await result.current.runtime.thread.append({
      role: "user",
      content: [{ type: "text", text }],
    });
  });
}

beforeEach(() => {
  sessionStorage.clear();
  catalog.agentId = "agent1";
  vi.clearAllMocks();
  __resetThreadSessionStoreForTests();
});

describe("a clipped design invitation is finished", () => {
  it("replaces the cut ending and leaves a finished reply alone", () => {
    expect(
      completeCutDesignInvitation("The plan is ready.\n\nPlease confirm or"),
    ).toBe(
      "The plan is ready.\n\nConfirm this design, or tell me what to change.",
    );
    expect(completeCutDesignInvitation("Hello there.")).toBe("Hello there.");
  });
});

describe("admission refusals are visible, and nothing is appended", () => {
  it("preserves New conversation when the initial agent catalog resolves", async () => {
    const { aiChatApi } = await import("../../../api/aiChat");
    catalog.agentId = null;
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([{ id: "t-previous", title: "Previous", archived: false } as never]);
    const { result, rerender } = renderHook(() => useAIChatRuntime(persistedProvider));
    await act(async () => { result.current.switchToNewThread(); });
    catalog.agentId = "agent1";
    rerender();
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.activeThreadId).toBeNull();
    expect(result.current.runtime.thread.getState().messages).toHaveLength(0);
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([]);
  });

  it.each(["public", "adapter"])("keeps an explicit new conversation when the initial list resolves late (%s)", async (path) => {
    const { aiChatApi } = await import("../../../api/aiChat");
    let resolveList!: (rows: never[]) => void;
    vi.mocked(aiChatApi.listThreads).mockImplementationOnce(() => new Promise((resolve) => { resolveList = resolve; }));
    const { result } = renderHook(() => useAIChatRuntime(persistedProvider));
    await waitFor(() => expect(resolveList).toBeDefined());
    await act(async () => {
      if (path === "adapter") await result.current.runtime.threads.switchToNewThread();
      else result.current.switchToNewThread();
    });
    await act(async () => { resolveList([{ id: "t-previous", title: "Previous", archived: false } as never]); });
    await waitFor(() => expect(result.current.threads).toHaveLength(1));
    expect(result.current.activeThreadId).toBeNull();
    expect(result.current.runtime.thread.getState().messages).toHaveLength(0);
  });

  it("preserves an explicit fresh start across a runtime remount", async () => {
    const { aiChatApi } = await import("../../../api/aiChat");
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([{ id: "t-previous", title: "Previous", archived: false } as never]);
    const first = renderHook(() => useAIChatRuntime(persistedProvider));
    await waitFor(() => expect(first.result.current.activeThreadId).toBe("t-previous"));
    await act(async () => { first.result.current.switchToNewThread(); });
    first.unmount();
    const second = renderHook(() => useAIChatRuntime(persistedProvider));
    await waitFor(() => expect(second.result.current.threads).toHaveLength(1));
    expect(second.result.current.activeThreadId).toBeNull();
    expect(second.result.current.runtime.thread.getState().messages).toHaveLength(0);
    await act(async () => { second.result.current.switchToThread("t-previous"); });
    second.unmount();
    const third = renderHook(() => useAIChatRuntime(persistedProvider));
    await waitFor(() => expect(third.result.current.activeThreadId).toBe("t-previous"));
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([]);
  });

  it("opens an explicit thread link despite a remembered fresh start", async () => {
    const { rememberFreshChat } = await import("../chatHandoff");
    rememberFreshChat({ principalId: "user1", workspaceId: "ws1", providerId: "persisted" }, true);
    const { result } = renderHook(() => useAIChatRuntime(persistedProvider, { initialThreadId: "t-linked" }));
    await waitFor(() => expect(result.current.activeThreadId).toBe("t-linked"));
  });

  it("allocates a fresh provider thread after switching to a new conversation", async () => {
    const { aiChatApi } = await import("../../../api/aiChat");
    vi.mocked(aiChatApi.createThread).mockResolvedValueOnce({
      id: "t-fresh",
      provider_id: "persisted",
      agent_id: "agent1",
      title: "",
      archived: false,
    } as never);
    const { result } = renderHook(() => useAIChatRuntime(persistedProvider));

    await act(async () => {
      result.current.switchToThread("t-previous");
      result.current.switchToNewThread();
    });
    await send(result, "start fresh");

    expect(aiChatApi.createThread).toHaveBeenCalledWith("persisted", {
      agentId: "agent1",
    });
    expect(result.current.activeThreadId).toBe("t-fresh");
  });

  it("says the cap was hit instead of appending an unanswered message", async () => {
    const { result } = renderHook(() => useAIChatRuntime(mockProvider));

    for (let i = 0; i < MAX_CONCURRENT_STREAMS; i++) {
      await act(async () => {
        result.current.switchToNewThread();
      });
      await send(result, `turn ${i}`);
    }
    expect(result.current.streamingThreadIds).toHaveLength(MAX_CONCURRENT_STREAMS);

    await act(async () => {
      result.current.switchToNewThread();
    });
    await send(result, "one too many");

    expect(result.current.streamError).toBe(
      `Too many conversations are running (${MAX_CONCURRENT_STREAMS}). Stop one and try again.`,
    );
    expect(texts(result)).not.toContain("one too many");
    expect(result.current.streamingThreadIds).toHaveLength(MAX_CONCURRENT_STREAMS);
  });

  it("treats a turn running on another tab as busy and refuses the send", async () => {
    const { result } = renderHook(() => useAIChatRuntime(mockProvider));
    await act(async () => {
      result.current.switchToThread("t-remote");
    });
    await act(async () => {
      markRemoteTurnStarted("t-remote", "ws1", "turn-9");
    });

    // The composer sees the thread as running even though this tab holds no
    // stream for it.
    expect(result.current.isRunning).toBe(true);

    await send(result, "hello?");

    // Busy is not a failed turn. The send is dropped and no alert is stored.
    expect(result.current.streamError).toBeNull();
    // assistant-ui may leave an empty placeholder row via setMessages; the
    // user text must not land as an unanswered message.
    expect(texts(result)).not.toContain("hello?");
    expect(result.current.streamingThreadIds).toEqual([]);
  });

  it("does not leave a busy alert after the turn that was already running finishes", async () => {
    const { result } = renderHook(() => useAIChatRuntime(mockProvider));
    await send(result, "first");
    expect(result.current.isRunning).toBe(true);

    await send(result, "second");
    expect(texts(result)).not.toContain("second");

    await waitFor(() => expect(result.current.isRunning).toBe(false));
    expect(result.current.streamError).toBeNull();
  });
});

describe("a send on a cold thread does not hide its history", () => {
  it("fetches the transcript after the stream and keeps the local turn", async () => {
    const { result } = renderHook(() => useAIChatRuntime(persistedProvider));

    await act(async () => {
      result.current.switchToThread("t-cold");
    });
    // Send before the (20ms) history fetch lands; the stream outlives it.
    await send(result, "hi");

    await waitFor(() => {
      const t = texts(result);
      expect(t).toContain("earlier question");
      expect(t).toContain("earlier answer");
      expect(t).toContain("hi");
      expect(t.some((x) => x.includes("Hello world"))).toBe(true);
    });
    // History first, then this turn.
    const t = texts(result);
    expect(t.indexOf("earlier answer")).toBeLessThan(t.indexOf("hi"));
  });
});

describe("mergeColdTranscript", () => {
  const server = [
    { id: "s1", role: "user" as const, content: [{ type: "text" as const, text: "q" }] },
    { id: "s2", role: "assistant" as const, content: [{ type: "text" as const, text: "a" }] },
  ];

  it("returns the server transcript when nothing was drafted locally", () => {
    expect(mergeColdTranscript(server, [])).toBe(server);
  });

  it("drops local rows the server already has and appends the rest", () => {
    const local = [
      { id: "u-1", role: "user" as const, content: [{ type: "text" as const, text: "q" }] },
      { id: "u-2", role: "user" as const, content: [{ type: "text" as const, text: "unsaved" }] },
    ];
    // Matched rows keep the LOCAL id so ExternalStore does not fork siblings.
    expect(mergeColdTranscript(server, local).map((m) => m.id)).toEqual([
      "u-1",
      "s2",
      "u-2",
    ]);
  });

  it("preserves local ids for matching role+text pairs", () => {
    const local = [
      { id: "local-u", role: "user" as const, content: [{ type: "text" as const, text: "q" }] },
      {
        id: "local-a",
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "a" }],
      },
    ];
    expect(mergeColdTranscript(server, local).map((m) => m.id)).toEqual([
      "local-u",
      "local-a",
    ]);
  });

  it("keeps local timing/finalPayload when the server row lacks them", () => {
    const local = [
      {
        id: "local-a",
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "a" }],
        metadata: {
          timing: {
            streamStartTime: 0,
            totalStreamTime: 1500,
            tokenCount: 10,
            totalChunks: 1,
            toolCallCount: 0,
          },
          custom: {
            finalPayload: {
              interaction: { usage: { total_tokens: 42 } },
            },
          },
        },
      },
    ];
    const serverOnly = [
      {
        id: "s2",
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "a" }],
      },
    ];
    const merged = mergeColdTranscript(serverOnly, local);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("local-a");
    expect(merged[0].metadata?.timing?.totalStreamTime).toBe(1500);
    expect(
      (merged[0].metadata?.custom as { finalPayload?: unknown })?.finalPayload,
    ).toEqual({ interaction: { usage: { total_tokens: 42 } } });
  });

  it("merges role-aligned assistants even when streamed text differs", () => {
    // Cold first-turn: local draft echoed the proposal; server persisted a
    // shorter closer. Role+text keys used to keep both → duplicate design card.
    const local = [
      {
        id: "local-u",
        role: "user" as const,
        content: [{ type: "text" as const, text: "build me an app" }],
      },
      {
        id: "local-a",
        role: "assistant" as const,
        content: [
          {
            type: "text" as const,
            text: "Let's design your Car Rental Management app with three tracks…",
          },
        ],
        metadata: {
          timing: {
            streamStartTime: 0,
            totalStreamTime: 18300,
            tokenCount: 72400,
            totalChunks: 1,
            toolCallCount: 4,
          },
        },
      },
    ];
    const serverRows = [
      {
        id: "s-u",
        role: "user" as const,
        content: [{ type: "text" as const, text: "build me an app" }],
      },
      {
        id: "s-a",
        role: "assistant" as const,
        content: [
          {
            type: "text" as const,
            text: "Here's the proposed design for your Car Rental Management app…",
          },
        ],
      },
    ];
    const merged = mergeColdTranscript(serverRows, local);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.id)).toEqual(["local-u", "local-a"]);
    expect(messageTextForTest(merged[1])).toContain("Here's the proposed design");
    expect(merged[1].metadata?.timing?.totalStreamTime).toBe(18300);
  });

  it("does not pair a new turn with older history that shares role shape", () => {
    const history = [
      {
        id: "s1",
        role: "user" as const,
        content: [{ type: "text" as const, text: "earlier question" }],
      },
      {
        id: "s2",
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "earlier answer" }],
      },
    ];
    const draft = [
      {
        id: "local-u",
        role: "user" as const,
        content: [{ type: "text" as const, text: "hi" }],
      },
      {
        id: "local-a",
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Hello world" }],
      },
    ];
    const merged = mergeColdTranscript(history, draft);
    expect(merged.map((m) => messageTextForTest(m))).toEqual([
      "earlier question",
      "earlier answer",
      "hi",
      "Hello world",
    ]);
  });
});

function messageTextForTest(m: { content?: unknown }): string {
  if (typeof m.content === "string") return m.content;
  return ((m.content as { type?: string; text?: string }[]) ?? [])
    .map((p) => (p.type === "text" ? p.text ?? "" : ""))
    .join("");
}
