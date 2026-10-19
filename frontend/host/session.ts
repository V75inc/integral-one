import type { HostSessionAdapter } from './session-contract';

declare global {
  interface Window {
    integralDesktop?: Omit<HostSessionAdapter, 'identity'>;
  }
}

/** One owns the native bridge; its IPC and receipt checks remain authoritative. */
export function getHostSession(): HostSessionAdapter | null {
  return window.integralDesktop
    ? { ...window.integralDesktop, identity: 'installation_owner' }
    : null;
}
