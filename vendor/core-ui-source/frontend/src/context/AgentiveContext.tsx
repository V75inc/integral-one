import { useSingleFlight } from '../hooks/useSingleFlight';
import { useSerialPolling } from '../hooks/useSerialPolling';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { getAgentiveStatus, type AgentiveStatus } from '../api/agentive';
import { useAuth } from './AuthContext';

interface AgentiveContextValue {
  enabled: boolean;
  agentConnected: boolean;
  agentConfig: AgentiveStatus['agent_config'];
  refresh: () => void;
}

const AgentiveContext = createContext<AgentiveContextValue>({
  enabled: false,
  agentConnected: false,
  agentConfig: undefined,
  refresh: () => {},
});

export function useAgentive() {
  return useContext(AgentiveContext);
}

const IDLE_STATUS: AgentiveStatus = {
  enabled: false,
  agent_connected: false,
};

export function AgentiveProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<AgentiveStatus>(IDLE_STATUS);

  const principalId = user?.user_id ?? user?.id;
  const owner = useRef(principalId);
  const mounted = useRef(true);
  owner.current = principalId;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useSingleFlight(useCallback(async () => {
    if (!principalId) {
      setStatus(IDLE_STATUS);
      return;
    }
    try {
      const next = await getAgentiveStatus();
      if (mounted.current && owner.current === principalId) setStatus(next);
    } catch {
      if (mounted.current && owner.current === principalId) setStatus(IDLE_STATUS);
    }
  }, [principalId]));

  // Status is auth-scoped — skip until session is resolved so we never hit
  // /agentive/status without a JWT (401 responses omit CORS headers and
  // surface as a misleading cross-origin error in split-host deploys).
  useEffect(() => {
    if (loading) return;
    refresh();
  }, [loading, refresh]);

  useSerialPolling(refresh, 12_000,
    !loading && Boolean(principalId) && status.enabled && !status.agent_connected);

  // Memoized for the same reason as AuthContext: an object literal here makes a
  // new context value on every provider render, re-rendering every useAgentive()
  // consumer even when the status is unchanged.
  const value = useMemo(
    () => ({
      enabled: status.enabled,
      agentConnected: status.agent_connected,
      agentConfig: status.agent_config,
      refresh,
    }),
    [status.enabled, status.agent_connected, status.agent_config, refresh],
  );

  return (
    <AgentiveContext.Provider value={value}>{children}</AgentiveContext.Provider>
  );
}