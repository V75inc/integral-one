import { useEffect, useSyncExternalStore } from 'react';
import apiClient from '../api/client';

export interface DeploymentCapabilities {
  profile: 'server' | 'desktop_single_user';
  identity: 'account' | 'local_owner';
  features: { collaboration: boolean; public_sharing: boolean; organization_workspaces: boolean; app_extensions: boolean; app_authoring: boolean; manual_records: boolean };
}

declare global {
  interface Window {
    integralDesktop?: {
      session(): Promise<import('../api/auth').LoginResponse>;
      profile?(): Promise<{email: string; name: string} | null>;
      signOut?(): Promise<void>;
      signIn?(): Promise<void>;
      resumeOffline?(): Promise<void>;
    };
  }
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
  const singleUser = state.data?.profile === 'desktop_single_user' || Boolean(window.integralDesktop);
  return { ...state, singleUser, collaboration: !singleUser && state.data?.features?.collaboration !== false };
}
