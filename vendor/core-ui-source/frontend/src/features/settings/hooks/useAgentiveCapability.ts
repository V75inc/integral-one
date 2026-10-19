import { useQuery } from '@tanstack/react-query';

import { getAgentiveStatus, type AgentiveStatus } from '../../../api/agentive';
import { useAuth } from '../../../context/AuthContext';

/** Agentive capability probe — respects BYO strict mode via /agentive/status. */
export interface AgentiveCapability {
  enabled: boolean;
  isLoading: boolean;
  agentConnected: boolean;
  agentKeyMode: string;
  blockedReason?: string;
}

export function useAgentiveCapability(): AgentiveCapability {
  const { user, loading: authLoading } = useAuth();
  const statusQuery = useQuery<AgentiveStatus>({
    queryKey: ['agentive', 'status'],
    queryFn: getAgentiveStatus,
    enabled: !!user && !authLoading,
    staleTime: 30_000,
  });

  const status = statusQuery.data;
  const agentKeyMode = status?.agent_key_mode ?? 'hybrid';
  const blockedReason =
    status?.reason === 'model_key_required' ? status.reason : undefined;

  return {
    enabled: status?.enabled ?? true,
    isLoading: authLoading || statusQuery.isLoading,
    agentConnected: status?.agent_connected ?? false,
    agentKeyMode,
    blockedReason,
  };
}
