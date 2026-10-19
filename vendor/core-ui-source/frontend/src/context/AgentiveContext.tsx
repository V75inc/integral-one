import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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

  const refresh = useCallback(() => {
    if (!user) {
      setStatus(IDLE_STATUS);
      return;
    }
    getAgentiveStatus()
      .then(setStatus)
      .catch(() => setStatus(IDLE_STATUS));
  }, [user]);

  // Status is auth-scoped — skip until session is resolved so we never hit
  // /agentive/status without a JWT (401 responses omit CORS headers and
  // surface as a misleading cross-origin error in split-host deploys).
  useEffect(() => {
    if (loading) return;
    refresh();
  }, [loading, refresh]);

  // Poll while agentive is on but no agent is connected yet (native provider may register after page load).
  //
  // Skipped while the tab is hidden. A background tab cannot show the result,
  // and this interval runs until native provider registers -- which, if it never does,
  // is forever. `visibilitychange` re-runs the effect so a returning user gets
  // a fresh value immediately rather than waiting out the remaining interval.
  useEffect(() => {
    if (loading || !user || !status.enabled || status.agent_connected) return undefined;

    let id: number | undefined;
    const stop = () => {
      if (id !== undefined) {
        window.clearInterval(id);
        id = undefined;
      }
    };
    const start = () => {
      if (id === undefined) id = window.setInterval(refresh, 12000);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      } else {
        refresh();
        start();
      }
    };

    if (document.visibilityState !== 'hidden') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loading, user, status.enabled, status.agent_connected, refresh]);

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