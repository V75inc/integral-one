import type { HostSessionAdapter } from './session-contract';

/** Hosts may overlay this implementation at build time. */
export function getHostSession(): HostSessionAdapter | null {
  return null;
}
