export type SessionConnection = 'reconnecting' | 'recovery' | null;
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
