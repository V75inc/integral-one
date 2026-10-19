import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAIChatRuntime } from "../useAIChatRuntime";
import type { ChatProvider, NormalizedEvent, TurnContext } from "../providers/types";

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
    focusedTrackId: "n.Track.abc",
    focusedViewId: "n.View.1",
    focusedAppId: null,
    pageKind: "track_detail",
    focusedEntryId: null,
    visibleData: null,
    metadata: null,
    setPageFocus: vi.fn(),
    clearPageFocus: vi.fn(),
    setPageContext: vi.fn(),
    clearPageContext: vi.fn(),
  }),
}));

const snapshot = {
  url: "/tracks/n.Track.abc",
  route_path: "/tracks/n.Track.abc",
  page_kind: "track_detail",
  focused_track_id: "n.Track.abc",
  focused_view_id: "n.View.1",
};

vi.mock("../useChatPageContextSnapshot", () => ({
  useChatPageContextSnapshot: () => () => snapshot,
}));

vi.mock("../../../api/aiChat", () => ({
  aiChatApi: {
    listThreads: vi.fn(async () => []),
    getThread: vi.fn(),
    createThread: vi.fn(),
    cancelThread: vi.fn(),
  },
}));

describe("useAIChatRuntime page context", () => {
  it("forwards page_context to provider.streamTurn", async () => {
    const captured: TurnContext[] = [];

    const provider: ChatProvider = {
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
      async *streamTurn(ctx: TurnContext): AsyncIterable<NormalizedEvent> {
        captured.push(ctx);
        yield { type: "text-delta", delta: "ok" };
      },
      listAgents: async () => [],
    };

    const { result } = renderHook(() => useAIChatRuntime(provider));

    await act(async () => {
      await result.current.runtime.thread.append({
        role: "user",
        content: [{ type: "text", text: "What is on this page?" }],
      });
    });

    expect(captured).toHaveLength(1);
    expect(captured[0]?.pageContext).toEqual(snapshot);
    expect(captured[0]?.focusedTrackId).toBe("n.Track.abc");
    expect(captured[0]?.focusedViewId).toBe("n.View.1");
  });
});
