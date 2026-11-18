import { getHostSession } from '../host/session';
import { useEffect, useSyncExternalStore } from 'react';
import { loadDeploymentMetadata, type DeploymentCapabilities } from '../api/deployment';
export type { DeploymentCapabilities } from '../api/deployment';

let snapshot: { data?: DeploymentCapabilities; error?: unknown } = {};
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;

export function useDeployment() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (pending) return;
    pending = loadDeploymentMetadata().then(data => {
      if (!['server', 'desktop_single_user'].includes(data?.profile) || typeof data?.features?.collaboration !== 'boolean') throw new Error('Invalid deployment capabilities');
      snapshot = { data };
    }).catch(error => { snapshot = { error }; pending = undefined; }).then(() => { for (const listener of listeners) listener(); });
  }, []);
  // Native presence only supplies a conservative UI default while Core responds.
  // The backend remains authoritative, including for browser access.
  const singleUser = state.data?.runtime?.identity === 'installation_owner' || state.data?.identity === 'local_owner' || getHostSession()?.identity === 'installation_owner';
  return { ...state, singleUser, collaboration: !singleUser && state.data?.features?.collaboration !== false };
}
