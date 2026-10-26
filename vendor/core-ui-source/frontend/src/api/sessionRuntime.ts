import { getHostSession } from '../host/session';

let localRuntime: boolean | undefined;

/** Metadata comes from Core's trusted startup configuration, never a UI setting. */
export function configureSessionRuntime(value: unknown): void {
  const data = value as { profile?: string; runtime?: { preset?: string; identity?: string } } | null;
  localRuntime = data?.runtime
    ? data.runtime.preset === 'local' && data.runtime.identity === 'installation_owner'
    : data?.profile === 'desktop_single_user' ? true
      : data?.profile === 'server' ? false : undefined;
}

export function isHostManagedSession(): boolean {
  // Native authority remains available when public metadata is temporarily offline.
  return localRuntime ?? getHostSession()?.identity === 'installation_owner';
}
