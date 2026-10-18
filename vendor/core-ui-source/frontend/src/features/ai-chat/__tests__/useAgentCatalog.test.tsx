import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi, describe, it, expect, beforeEach } from "vitest";
import type { ReactNode } from "react";

import { useAgentCatalog } from "../useAgentCatalog";
import type { ChatProvider } from "../providers/types";

vi.mock("../../../api/aiChat", () => ({
  aiChatApi: {
    listAgents: vi.fn(),
    getAgentPreference: vi.fn(),
    setAgentPreference: vi.fn(),
  },
}));
import { aiChatApi } from "../../../api/aiChat";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

const mockProvider: ChatProvider = {
  id: "integral_native",
  label: "integral_native",
  serverPersisted: true,
  capabilities: {
    reasoning: true,
    tools: true,
    attachments: true,
    vision: false,
    voice: false,
  },
  streamTurn: async function* () {},
  listAgents: vi.fn(),
};

describe("useAgentCatalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (aiChatApi.listAgents as any).mockResolvedValue([
      { id: "iris", name: "Iris", description: "" },
      { id: "aiva", name: "Aiva", description: "" },
    ]);
    (mockProvider.listAgents as any).mockImplementation(() =>
      (aiChatApi.listAgents as any)(),
    );
  });

  it("falls back to first catalog agent when no preference exists", async () => {
    (aiChatApi.getAgentPreference as any).mockResolvedValue(null);
    const { result } = renderHook(
      () => useAgentCatalog(mockProvider, "ws-1"),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.activeAgent?.id).toBe("iris");
    });
  });

  it("uses preference agent when one is set", async () => {
    (aiChatApi.getAgentPreference as any).mockResolvedValue({
      provider_id: "integral_native",
      agent_id: "aiva",
    });
    const { result } = renderHook(
      () => useAgentCatalog(mockProvider, "ws-1"),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.activeAgent?.id).toBe("aiva");
    });
  });

  it("switchAgent persists via setAgentPreference", async () => {
    (aiChatApi.getAgentPreference as any).mockResolvedValue(null);
    (aiChatApi.setAgentPreference as any).mockResolvedValue({
      provider_id: "integral_native",
      agent_id: "aiva",
    });
    const { result } = renderHook(
      () => useAgentCatalog(mockProvider, "ws-1"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.activeAgent?.id).toBe("iris"));

    await act(async () => {
      await result.current.switchAgent("aiva");
    });

    expect(aiChatApi.setAgentPreference).toHaveBeenCalledWith("ws-1", {
      provider_id: "integral_native",
      agent_id: "aiva",
    });
  });

  it("returns empty catalog and null activeAgent for single-agent provider", async () => {
    (aiChatApi.listAgents as any).mockResolvedValue([]);
    (aiChatApi.getAgentPreference as any).mockResolvedValue(null);
    const { result } = renderHook(
      () => useAgentCatalog(mockProvider, "ws-1"),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.agents).toEqual([]);
      expect(result.current.activeAgent).toBeNull();
    });
  });
});
