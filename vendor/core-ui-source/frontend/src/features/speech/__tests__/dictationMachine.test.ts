import { describe, expect, it } from 'vitest';

import {
  dictationReducer,
  INITIAL_DICTATION_STATE,
  isDictating,
  type DictationAction,
  type DictationState,
} from '../dictationMachine';
import { sttError } from '../engines/types';

function run(actions: DictationAction[], from: DictationState = INITIAL_DICTATION_STATE) {
  return actions.reduce(dictationReducer, from);
}

describe('dictationReducer', () => {
  it('walks the happy path', () => {
    expect(run([{ type: 'start' }]).status).toBe('requesting-permission');
    expect(run([{ type: 'start' }, { type: 'permission-granted' }]).status).toBe('connecting');
    const listening = run([
      { type: 'start' },
      { type: 'permission-granted' },
      { type: 'ready' },
    ]);
    expect(listening.status).toBe('listening');
    expect(isDictating(listening.status)).toBe(true);
    expect(run([{ type: 'stop' }], listening).status).toBe('finalizing');
    expect(run([{ type: 'stop' }, { type: 'ended' }], listening).status).toBe('idle');
  });

  it('can stop before the engine is ready', () => {
    const connecting = run([{ type: 'start' }, { type: 'permission-granted' }]);
    expect(run([{ type: 'stop' }], connecting).status).toBe('finalizing');
  });

  it('ignores a late ready after stopping', () => {
    const state = run([
      { type: 'start' },
      { type: 'permission-granted' },
      { type: 'stop' },
      { type: 'ready' },
    ]);
    expect(state.status).toBe('finalizing');
  });

  it('ignores start while already dictating', () => {
    const listening = run([{ type: 'start' }, { type: 'permission-granted' }, { type: 'ready' }]);
    expect(run([{ type: 'start' }], listening)).toBe(listening);
  });

  it('records failures and restarts from an error', () => {
    const error = sttError('permission-denied', 'blocked');
    const failed = run([{ type: 'start' }, { type: 'fail', error }]);
    expect(failed).toEqual({ status: 'error', error });
    expect(run([{ type: 'ended' }], failed)).toBe(failed);
    expect(run([{ type: 'start' }], failed)).toEqual({
      status: 'requesting-permission',
      error: null,
    });
    expect(run([{ type: 'reset' }], failed)).toEqual(INITIAL_DICTATION_STATE);
  });
});
