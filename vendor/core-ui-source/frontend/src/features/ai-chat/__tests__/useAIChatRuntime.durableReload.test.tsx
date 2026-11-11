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
    getThreadIfChanged: vi.fn(),
    createThread: vi.fn(),
    listFollowUps: vi.fn(async () => ({items: [], paused: false})),
    queueFollowUp: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(aiChatApi.listFollowUps).mockResolvedValue({items: [], paused: false});
    __resetThreadSessionStoreForTests();
    localStorage.clear();
  });
  it("loads background messages missed while the events socket was disconnected", async () => {
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    vi.mocked(aiChatApi.getThread).mockResolvedValue({...thread, messages: [user]});
    const {result} = renderHook(() => useAIChatRuntime(nativeProvider(async function* () {}), {initialThreadId: "t1"}));
    await waitFor(() => expect(result.current.composerReady).toBe(true));
    vi.mocked(aiChatApi.getThread).mockResolvedValue({...thread, messages: [user, assistant]});
    act(() => window.dispatchEvent(new Event("integral:agent-events-reconnected")));
    await waitFor(() => expect(result.current.runtime.thread.getState().messages.map(message => message.id))
      .toEqual(["accepted-user", "saved-assistant"]));
  });
  it("coalesces background invalidations that arrive during the initial transcript read", async () => {
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    let resolveInitial!: (value: Awaited<ReturnType<typeof aiChatApi.getThread>>) => void;
    vi.mocked(aiChatApi.getThread)
      .mockImplementationOnce(() => new Promise(resolve => { resolveInitial = resolve; }))
      .mockResolvedValue({...thread, messages: [user, assistant]});
    const provider = nativeProvider(async function* () {});
    const {result} = renderHook(() => useAIChatRuntime(provider, {initialThreadId: "t1"}));
    await waitFor(() => expect(aiChatApi.getThread).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new CustomEvent("integral:thread-stream-update", {
        detail: {thread_id: "t1", status: "message", message_id: assistant.id},
      }));
      window.dispatchEvent(new Event("integral:agent-events-reconnected"));
    });
    expect(aiChatApi.getThread).toHaveBeenCalledTimes(1);
    await act(async () => resolveInitial({...thread, messages: [user]}));

    await waitFor(() => expect(result.current.runtime.thread.getState().messages.map(message => message.id))
      .toEqual([user.id, assistant.id]));
    expect(aiChatApi.getThread).toHaveBeenCalledTimes(2);
  });

  it("finds a persisted alert without a WebSocket event and probes the new revision", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
      vi.mocked(aiChatApi.getThread).mockResolvedValue({...thread, updated_at: "before", messages: [user]});
      vi.mocked(aiChatApi.getThreadIfChanged)
        .mockResolvedValueOnce({...thread, updated_at: "after", messages: [user, assistant]})
        .mockResolvedValue(null);
      const provider = nativeProvider(async function* () {});
      const {result} = renderHook(() => useAIChatRuntime(provider, {initialThreadId: "t1"}));
      await act(async () => vi.advanceTimersByTimeAsync(0));
      expect(result.current.composerReady).toBe(true);
      await act(async () => vi.advanceTimersByTimeAsync(20_000));
      expect(aiChatApi.getThreadIfChanged).toHaveBeenNthCalledWith(1, "t1", "before");
      expect(result.current.runtime.thread.getState().messages.map(message => message.id))
        .toEqual([user.id, assistant.id]);
      await act(async () => vi.advanceTimersByTimeAsync(20_000));
      expect(aiChatApi.getThreadIfChanged).toHaveBeenNthCalledWith(2, "t1", "after");
      expect(aiChatApi.getThread).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("revalidates a warm conversation when it is opened again", async () => {
    const other = {...thread, id: "t2", title: "Other conversation"};
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread, other]);
    vi.mocked(aiChatApi.getThread).mockImplementation(async id =>
      id === "t1" ? {...thread, messages: [user]} : {...other, messages: []},
    );
    const {result} = renderHook(() => useAIChatRuntime(nativeProvider(async function* () {}), {initialThreadId: "t1"}));
    await waitFor(() => expect(result.current.composerReady).toBe(true));
    act(() => result.current.switchToThread("t2"));
    await waitFor(() => expect(aiChatApi.getThread).toHaveBeenCalledWith("t2"));

    vi.mocked(aiChatApi.getThread).mockImplementation(async id =>
      id === "t1" ? {...thread, messages: [user, assistant]} : {...other, messages: []},
    );
    act(() => result.current.switchToThread("t1"));
    await waitFor(() => expect(result.current.runtime.thread.getState().messages.map(message => message.id))
      .toEqual(["accepted-user", "saved-assistant"]));
  });

  it("reconciles missed background messages when the tab becomes visible", async () => {
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    vi.mocked(aiChatApi.getThread).mockResolvedValue({...thread, messages: [user]});
    const {result} = renderHook(() => useAIChatRuntime(nativeProvider(async function* () {}), {initialThreadId: "t1"}));
    await waitFor(() => expect(result.current.composerReady).toBe(true));
    vi.mocked(aiChatApi.getThread).mockResolvedValue({...thread, messages: [user, assistant]});
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    try {
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      expect(aiChatApi.getThread).toHaveBeenCalledTimes(1);
      visibility.mockReturnValue("visible");
      act(() => document.dispatchEvent(new Event("visibilitychange")));
      await waitFor(() => expect(result.current.runtime.thread.getState().messages.map(message => message.id))
        .toEqual(["accepted-user", "saved-assistant"]));
    } finally {
      visibility.mockRestore();
    }
  });

  it.each(["active_work_item_id", "parked_work_item_id"] as const)(
    "reattaches via %s without sending another user message", async (workItemField) => {
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    vi.mocked(aiChatApi.getThread)
      .mockResolvedValueOnce({...thread, [workItemField]: "chat-turn:owned", messages: [user]})
      .mockResolvedValue({...thread, active_work_item_id: null, messages: [user, assistant]});
    const stream = vi.fn(async function* (_ctx: Parameters<ChatProvider["streamTurn"]>[0]): AsyncIterable<NormalizedEvent> {
      yield {type: "navigation", path: "/tracks/n.Track.collection", thread_id: "t1", workspace_id: "ws1"};
      yield {type: "text-delta", delta: "Recovered answer"};
      yield {type: "message-finish"};
    });
    const onNavigate = vi.fn();
    const {result} = renderHook(() => useAIChatRuntime(nativeProvider(stream), {initialThreadId: "t1", onNavigate}));
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
    expect(stream.mock.calls[0][0]).toEqual(expect.objectContaining({resumeWorkItemId: "chat-turn:owned", userMessageText: ""}));
    await waitFor(() => {
      const messages = result.current.runtime.thread.getState().messages;
      expect(messages.map(message => message.id)).toEqual(["accepted-user", "saved-assistant"]);
    });
    expect(aiChatApi.createThread).not.toHaveBeenCalled();
    expect(aiChatApi.getThread).toHaveBeenCalledTimes(2);
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it("restores queued follow-ups and attaches to a worker-promoted turn", async () => {
    const queued = {client_request_id: "queue-1", text: "Afterward", entity_refs: []};
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    vi.mocked(aiChatApi.listFollowUps).mockResolvedValue({items: [queued], paused: false});
    vi.mocked(aiChatApi.getThread).mockResolvedValue({...thread, messages: [user]});
    const stream = vi.fn(async function* (_ctx: Parameters<ChatProvider["streamTurn"]>[0]): AsyncIterable<NormalizedEvent> {
      yield {type: "message-finish"};
    });
    const provider = nativeProvider(stream);
    const {result} = renderHook(() => useAIChatRuntime(provider, {initialThreadId: "t1"}));
    await waitFor(() => expect(result.current.followUps).toEqual([
      expect.objectContaining({id: "queue-1", text: "Afterward", state: "queued"}),
    ]));
    expect(stream).not.toHaveBeenCalled();
    vi.mocked(aiChatApi.listFollowUps).mockResolvedValue({items: [], paused: false});
    vi.mocked(aiChatApi.getThread)
      .mockResolvedValueOnce({...thread, active_work_item_id: "worker-follow-up", messages: [user]})
      .mockResolvedValue({...thread, messages: [user, assistant]});
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(1), {timeout: 3000});
    expect(stream.mock.calls[0][0].resumeWorkItemId).toBe("worker-follow-up");
    expect(result.current.followUps).toEqual([]);
    expect(aiChatApi.queueFollowUp).not.toHaveBeenCalled();
  });

  it.each([false, true])("defers live navigation and protects a composer draft (%s)", async blocked => {
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    vi.mocked(aiChatApi.getThread).mockResolvedValue({...thread, messages: [user]});
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const composer = document.createElement('textarea');
    composer.setAttribute('aria-label', 'Message input');
    composer.value = blocked ? 'An unfinished message' : '';
    document.body.append(composer);
    let settle!: () => void;
    const completion = new Promise<void>(resolve => { settle = resolve; });
    const stream = vi.fn(async function* (): AsyncIterable<NormalizedEvent> {
      yield {type: "navigation", path: "/tracks/n.Track.collection", thread_id: "t1", workspace_id: "ws1"};
      await completion;
      yield {type: "message-finish"};
    });
    const onNavigate = vi.fn();
    const {result} = renderHook(() => useAIChatRuntime(nativeProvider(stream), {initialThreadId: "t1", onNavigate}));
    try {
      await waitFor(() => expect(result.current.composerReady).toBe(true));
      await act(async () => {
        await result.current.runtime.thread.append({role: "user", content: [{type: "text", text: "Show me that."}]});
      });
      await waitFor(() => expect(stream).toHaveBeenCalledTimes(1));
      expect(onNavigate).not.toHaveBeenCalled();
      await act(async () => { settle(); await completion; });
      await waitFor(() => expect(result.current.isRunning).toBe(false));
      if (blocked) expect(onNavigate).not.toHaveBeenCalled();
      else expect(onNavigate).toHaveBeenCalledWith('/tracks/n.Track.collection', 't1');
    } finally {
      composer.remove();
      visibility.mockRestore();
    }
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
  it("keeps durable host continuation receipts out of conversation bubbles", async () => {
    vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
    vi.mocked(aiChatApi.getThread).mockResolvedValue({
      ...thread,
      active_work_item_id: null,
      messages: [user, {
        id: "host-receipt", thread_id: "t1", role: "system",
        parts: [{type: "text", text: "Approval outcome received."}],
      }, assistant],
    });
    const stream = vi.fn(async function* (): AsyncIterable<NormalizedEvent> {});
    const {result} = renderHook(() => useAIChatRuntime(nativeProvider(stream), {initialThreadId: "t1"}));
    await waitFor(() => expect(result.current.composerReady).toBe(true));
    expect(result.current.runtime.thread.getState().messages.map(message => message.id))
      .toEqual(["accepted-user", "saved-assistant"]);
    expect(stream).not.toHaveBeenCalled();
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


it.each([
  { origin: 'routine_task', routine_id: 'routine-1', delivery_mode: 'reminder' },
  { interact_payload: { origin: 'routine_task', routine_id: 'routine-1' } },
  { interactPayload: { origin: 'routine_task', routine_id: 'routine-1' } },
])('retains the exact scheduled routine when restoring a transcript', async provider_metadata => {
  __resetThreadSessionStoreForTests();
  vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
  vi.mocked(aiChatApi.getThread).mockResolvedValue({ ...thread, messages: [{ ...assistant, provider_metadata }] });
  const { result } = renderHook(() => useAIChatRuntime(nativeProvider(async function* () {}), { initialThreadId: 't1' }));
  await waitFor(() => expect(result.current.composerReady).toBe(true));
  const message = result.current.runtime.thread.getState().messages[0];
  expect(message.metadata?.custom).toMatchObject({ interactPayload: { origin: 'routine_task', routine_id: 'routine-1' } });
});

it("refreshes an open conversation for a persisted task watch alert", async () => {
  __resetThreadSessionStoreForTests();
  vi.mocked(aiChatApi.listThreads).mockResolvedValue([thread]);
  vi.mocked(aiChatApi.getThread).mockResolvedValue({ ...thread, messages: [user] });
  const provider = nativeProvider(async function* () {});
  const { result } = renderHook(() => useAIChatRuntime(provider, { initialThreadId: "t1" }));
  await waitFor(() => expect(result.current.composerReady).toBe(true));
  vi.mocked(aiChatApi.getThread).mockResolvedValue({
    ...thread,
    messages: [user, { ...assistant, provider_metadata: { origin: "routine_task", delivery_mode: "task_watch" } }],
  });
  act(() => window.dispatchEvent(new CustomEvent("integral:thread-stream-update", {
    detail: { thread_id: "t1", status: "message", message_id: assistant.id },
  })));
  await waitFor(() => expect(result.current.runtime.thread.getState().messages.map(message => message.id))
    .toEqual([user.id, assistant.id]));
});
