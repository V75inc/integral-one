import { getHostSession } from '../host/session';
import { useEffect, useSyncExternalStore } from 'react';
import apiClient from '../api/client';
import type { SessionPolicy } from '../api/sessionPolicy';

export interface DeploymentCapabilities {
  session_policy?: SessionPolicy;
  profile: 'server' | 'desktop_single_user';
  identity: 'account' | 'local_owner';
  runtime?: { contract_version: 1; preset: 'local' | 'hosted'; identity: 'installation_owner' | 'accounts'; workspace_kinds: string[] };
  features: { collaboration: boolean; public_sharing: boolean; organization_workspaces: boolean; app_extensions: boolean; app_authoring: boolean; manual_records: boolean };
}

let snapshot: { data?: DeploymentCapabilities; error?: unknown } = {};
let pending: Promise<void> | undefined;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;

export function useDeployment() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    if (pending) return;
    pending = apiClient.get<DeploymentCapabilities>('/meta/deployment').then(response => {
      if (!['server', 'desktop_single_user'].includes(response.data?.profile) || typeof response.data?.features?.collaboration !== 'boolean') throw new Error('Invalid deployment capabilities');
      snapshot = { data: response.data };
    }).catch(error => { snapshot = { error }; }).then(() => { for (const listener of listeners) listener(); });
  }, []);
  // Native presence only supplies a conservative UI default while Core responds.
  // The backend remains authoritative, including for browser access.
  const singleUser = state.data?.runtime?.identity === 'installation_owner' || state.data?.identity === 'local_owner' || getHostSession()?.identity === 'installation_owner';
  return { ...state, singleUser, collaboration: !singleUser && state.data?.features?.collaboration !== false };
}
