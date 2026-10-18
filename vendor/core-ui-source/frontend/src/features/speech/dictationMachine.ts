/**
 * Dictation lifecycle as a pure reducer. Illegal transitions are ignored, so
 * a late engine event (e.g. `ready` after the user already stopped) can't
 * resurrect a finished session.
 */
import type { SttError } from './engines/types';

export type DictationStatus =
  | 'idle'
  | 'requesting-permission'
  | 'connecting'
  | 'listening'
  | 'finalizing'
  | 'error';

export interface DictationState {
  status: DictationStatus;
  error: SttError | null;
}

export type DictationAction =
  | { type: 'start' }
  | { type: 'permission-granted' }
  | { type: 'ready' }
  | { type: 'stop' }
  | { type: 'ended' }
  | { type: 'fail'; error: SttError }
  | { type: 'reset' };

export const INITIAL_DICTATION_STATE: DictationState = { status: 'idle', error: null };

const ACTIVE: ReadonlySet<DictationStatus> = new Set([
  'requesting-permission',
  'connecting',
  'listening',
]);

export function dictationReducer(
  state: DictationState,
  action: DictationAction,
): DictationState {
  switch (action.type) {
    case 'start':
      return state.status === 'idle' || state.status === 'error'
        ? { status: 'requesting-permission', error: null }
        : state;
    case 'permission-granted':
      return state.status === 'requesting-permission'
        ? { status: 'connecting', error: null }
        : state;
    case 'ready':
      return state.status === 'connecting' ? { status: 'listening', error: null } : state;
    case 'stop':
      return ACTIVE.has(state.status) ? { status: 'finalizing', error: null } : state;
    case 'ended':
      return state.status === 'idle' || state.status === 'error'
        ? state
        : { status: 'idle', error: null };
    case 'fail':
      return { status: 'error', error: action.error };
    case 'reset':
      return INITIAL_DICTATION_STATE;
    default:
      return state;
  }
}

/** True while the mic is (or is about to be) capturing. */
export function isDictating(status: DictationStatus): boolean {
  return ACTIVE.has(status) || status === 'finalizing';
}
