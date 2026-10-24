import { isPublicAuthPath } from './sessionRoutes';
import { isHostManagedSession } from './sessionRuntime';

/** UI lock only. Authentication and token expiry remain server enforced. */
export type SessionRecovery = 'renew' | 'signin' | null;

let state: SessionRecovery = null;
let accountId: string | null = null;
const listeners = new Set<() => void>();

export const getSessionRecovery = (): SessionRecovery => state;
export const isSessionPaused = (): boolean => state !== null;
export const getRecoveryAccountId = (): string | null => accountId;
export const subscribeSessionRecovery = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function enableSessionRecovery(id: string | null): void {
  accountId = id;
  if (!id) finishSessionRecovery();
}

export function requestSessionRecovery(mode: Exclude<SessionRecovery, null>): boolean {
  if (isHostManagedSession() || !accountId || (typeof window !== 'undefined' && isPublicAuthPath(window.location.pathname))) return false;
  // A rejected refresh token must never be downgraded to a refresh-only prompt.
  state = state === 'signin' ? state : mode;
  listeners.forEach(listener => listener());
  return true;
}

export function finishSessionRecovery(): void {
  state = null;
  listeners.forEach(listener => listener());
}
