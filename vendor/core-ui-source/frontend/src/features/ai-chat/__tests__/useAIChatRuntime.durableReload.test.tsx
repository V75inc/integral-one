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

import { aiChatApi } from "../../../api/aiChat";

const user = {id: "accepted-user", thread_id: "t1", role: "user" as const, parts: [{type: "text", text: "My idea"}]};
const assistant = {id: "saved-assistant", thread_id: "t1", role: "assistant" as const, parts: [{type: "text", text: "Recovered answer"}]};
const thread = {id: "t1", provider_id: "integral_native", agent_id: "agent1", title: "My idea", archived: false};

function nativeProvider(streamTurn: ChatProvider["streamTurn"]): ChatProvider {
  return {id: "integral_native", label: "Integral AI", serverPersisted: true,
    capabilities: {reasoning: false, tools: true, attachments: true, vision: false, voice: false},
    streamTurn, listAgents: async () => [],
  };
}

describe("owned durable work after reload", () => {
  beforeEach(() => { vi.clearAllMocks(); __resetThreadSessionStoreForTests(); localStorage.clear(); });
  it("attaches once without another user message and reloads the canonical result", async () => {
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    vi.mocked(aiChatApi.getThread)
      .mockResolvedValueOnce({...thread, active_work_item_id: "chat-turn:owned", messages: [user]})
      .mockResolvedValue({...thread, active_work_item_id: null, messages: [user, assistant]});
    const stream = vi.fn(async function* (_ctx: Parameters<ChatProvider["streamTurn"]>[0]): AsyncIterable<NormalizedEvent> {
      yield {type: "text-delta", delta: "Recovered answer"};
      yield {type: "message-finish"};
    });
    const {result} = renderHook(() => useAIChatRuntime(nativeProvider(stream), {initialThreadId: "t1"}));
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    expect(stream.mock.calls[0][0]).toEqual(expect.objectContaining({resumeWorkItemId: "chat-turn:owned", userMessageText: ""}));
    await waitFor(() => {
      const messages = result.current.runtime.thread.getState().messages;
      expect(messages.map(message => message.id)).toEqual(["accepted-user", "saved-assistant"]);
    });
    expect(aiChatApi.createThread).not.toHaveBeenCalled();
    expect(aiChatApi.getThread).toHaveBeenCalledTimes(2);
  });
  it("does not loop when the saved response cannot be delivered", async () => {
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    vi.mocked(aiChatApi.getThread).mockResolvedValue({...thread, active_work_item_id: "chat-turn:owned", messages: [user]});
    const stream = vi.fn(async function* (_ctx: Parameters<ChatProvider["streamTurn"]>[0]): AsyncIterable<NormalizedEvent> {
      yield {type: "error", code: "network", message: "Connection interrupted"};
    });
    renderHook(() => useAIChatRuntime(nativeProvider(stream), {initialThreadId: "t1"}));
    await waitFor(() => expect(aiChatApi.getThread).toHaveBeenCalledTimes(2));
    expect(stream).toHaveBeenCalledTimes(1);
    expect(aiChatApi.createThread).not.toHaveBeenCalled();
  });
});


it("waits for the selected transcript before enabling the composer", async () => {
  __resetThreadSessionStoreForTests();
  vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
  let resolve!: (value: Awaited<ReturnType<typeof aiChatApi.getThread>>) => void;
  vi.mocked(aiChatApi.getThread).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const provider = nativeProvider(async function* () {});
  const { result } = renderHook(() => useAIChatRuntime(provider, { initialThreadId: "t1" }));
  await waitFor(() => expect(result.current.activeThreadId).toBe("t1"));
  expect(result.current.composerReady).toBe(false);
  await act(async () => resolve({ ...thread, messages: [user, assistant] }));
  await waitFor(() => expect(result.current.composerReady).toBe(true));
  expect(result.current.runtime.thread.getState().messages.map(message => message.id)).toEqual(["accepted-user", "saved-assistant"]);
});
