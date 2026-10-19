import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { aiChatApi } from "../../api/aiChat";
import type { AgentDescriptor, ChatProvider } from "./providers/types";

export interface UseAgentCatalog {
  agents: AgentDescriptor[];
  activeAgent: AgentDescriptor | null;
  preferenceAgentId: string | null;
  isLoading: boolean;
  error: Error | null;
  switchAgent: (agentId: string) => Promise<void>;
}

/**
 * Orchestrates the agent catalog and the per-(user × workspace)
 * preference. ``activeAgent`` resolves with the priority:
 *
 *   1. open thread's agent_id (caller supplies via override prop — not
 *      handled here; the assistant-ui thread runtime exposes the active
 *      thread separately, so the picker reads thread agent independently
 *      and falls back to this hook's ``preferenceAgentId`` when no thread
 *      is open)
 *   2. workspace preference
 *   3. first agent in catalog
 */
export function useAgentCatalog(
  provider: ChatProvider,
  workspaceId: string,
): UseAgentCatalog {
  const queryClient = useQueryClient();

  const catalogQuery = useQuery({
    queryKey: ["agent-catalog", provider.id, workspaceId],
    queryFn: () => provider.listAgents(),
    staleTime: 5 * 60 * 1000,
    enabled: !!workspaceId,
  });

  const prefQuery = useQuery({
    queryKey: ["agent-preference", workspaceId],
    queryFn: () => aiChatApi.getAgentPreference(workspaceId),
    enabled: !!workspaceId,
  });

  const setPrefMutation = useMutation({
    mutationFn: (agentId: string) =>
      aiChatApi.setAgentPreference(workspaceId, {
        provider_id: provider.id,
        agent_id: agentId,
      }),
    onMutate: async (agentId) => {
      const previous = queryClient.getQueryData([
        "agent-preference",
        workspaceId,
      ]);
      queryClient.setQueryData(["agent-preference", workspaceId], {
        provider_id: provider.id,
        agent_id: agentId,
      });
      return { previous };
    },
    onError: (_err, _agentId, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(
          ["agent-preference", workspaceId],
          ctx.previous,
        );
      }
    },
  });

  const agents = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const preferenceAgentId = prefQuery.data?.agent_id ?? null;

  const activeAgent = useMemo<AgentDescriptor | null>(() => {
    if (agents.length === 0) return null;
    if (preferenceAgentId) {
      const match = agents.find((a) => a.id === preferenceAgentId);
      if (match) return match;
    }
    return agents[0];
  }, [agents, preferenceAgentId]);

  const switchAgent = useCallback(
    async (agentId: string) => {
      if (agentId === activeAgent?.id) return;
      await setPrefMutation.mutateAsync(agentId);
      // Invalidate the threadlist scoped to (workspace, provider, agent)
      // so the surface refetches under the new agent.
      await queryClient.invalidateQueries({
        queryKey: ["chat-threads", workspaceId, provider.id, agentId],
      });
      // Also invalidate the unfiltered / legacy key the runtime may use.
      await queryClient.invalidateQueries({
        queryKey: ["chat-threads", workspaceId, provider.id],
      });
    },
    [activeAgent?.id, provider.id, queryClient, setPrefMutation, workspaceId],
  );

  return {
    agents,
    activeAgent,
    preferenceAgentId,
    isLoading: catalogQuery.isLoading || prefQuery.isLoading,
    error: (catalogQuery.error ?? prefQuery.error ?? null) as Error | null,
    switchAgent,
  };
}
