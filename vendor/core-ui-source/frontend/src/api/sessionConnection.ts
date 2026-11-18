export type SessionConnection = 'reconnecting' | 'recovery' | null;
let recoveryGeneration = 0;
const recoveryListeners = new Set<() => void>();
export const getHostSessionRecoveryGeneration = (): number => recoveryGeneration;
export const subscribeHostSessionRecovery = (listener: () => void): (() => void) => {
  recoveryListeners.add(listener);
  return () => { recoveryListeners.delete(listener); };
};
/** Called only after the desktop host's owner has been verified. */
export function markHostSessionRecovered(): void {
  recoveryGeneration += 1;
  recoveryListeners.forEach(listener => listener());
}
let state: SessionConnection = null;
const listeners = new Set<() => void>();
export const getSessionConnection = (): SessionConnection => state;
export const subscribeSessionConnection = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export function setSessionConnection(next: SessionConnection): void {
  if (state === next) return;
  state = next;
  listeners.forEach(listener => listener());
}
