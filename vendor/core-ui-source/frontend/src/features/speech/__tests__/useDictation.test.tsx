import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/speech', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/speech')>()),
  mintSpeechSession: vi.fn(),
}));

import { mintSpeechSession, type SpeechConfig } from '../../../api/speech';
import { createEmitter } from '../engines/emitter';
import { registerSttEngine, resetSttEngines } from '../engines/registry';
import type { SttEngine, SttEvent, SttSession } from '../engines/types';
import { useDictation } from '../useDictation';

const mint = mintSpeechSession as unknown as ReturnType<typeof vi.fn>;

let order: string[];
let emitter: ReturnType<typeof createEmitter<SttEvent>>;
let session: SttSession;
let engine: SttEngine;
let track: { stop: ReturnType<typeof vi.fn> };
let getUserMedia: ReturnType<typeof vi.fn>;
let textarea: HTMLTextAreaElement;
let submit: ReturnType<typeof vi.fn<() => void>>;
let threadRunning: boolean;

function makeConfig(overrides: Partial<SpeechConfig['preferences']> = {}): SpeechConfig {
  return {
    workspace_id: 'ws-1',
    workspace_role: 'owner',
    preferences: {
      enabled: true,
      engine: 'auto',
      language: 'auto',
      hotkey: 'Mod+Shift+Space',
      hotkey_mode: 'hold_or_toggle',
      auto_send_on_stop: false,
      silence_timeout_seconds: 0,
      ...overrides,
    },
    engines: [
      {
        engine: 'test-engine',
        source: 'browser',
        display_name: 'Test',
        streaming: true,
        privacy_note: null,
      },
    ],
    preferred_engine: 'test-engine',
    provider: {
      configured: false,
      available_to_you: false,
      provider: null,
      model: null,
      source: null,
    },
    limits: { max_session_seconds: 300, session_ttl_seconds: 60 },
  };
}

function setup(config: SpeechConfig = makeConfig()) {
  return renderHook(() =>
    useDictation({
      config,
      getTextarea: () => textarea,
      submit,
      isThreadRunning: () => threadRunning,
    }),
  );
}

function registerEngine(needsServerSession = false) {
  engine = {
    id: 'test-engine',
    label: 'Test',
    kind: needsServerSession ? 'remote' : 'browser',
    needsServerSession,
    isSupported: () => true,
    start: vi.fn(async () => {
      order.push('engine.start');
      return session;
    }),
  };
  registerSttEngine(engine);
}

beforeEach(() => {
  order = [];
  emitter = createEmitter<SttEvent>();
  session = {
    on: emitter.on,
    stop: vi.fn(async () => emitter.emit({ type: 'end', reason: 'stopped' })),
    abort: vi.fn(() => emitter.emit({ type: 'end', reason: 'aborted' })),
  };
  track = { stop: vi.fn() };
  getUserMedia = vi.fn(async () => {
    order.push('getUserMedia');
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  });
  textarea = document.createElement('textarea');
  document.body.appendChild(textarea);
  textarea.value = 'Hi';
  textarea.setSelectionRange(2, 2);
  submit = vi.fn<() => void>();
  threadRunning = false;
  resetSttEngines();
  registerEngine();
});

afterEach(() => {
  textarea.remove();
  resetSttEngines();
  mint.mockReset();
});

describe('useDictation', () => {
  it('skips getUserMedia for browser engines that open their own capture', async () => {
    const { result } = setup();
    expect(result.current.available).toBe(true);

    await act(async () => {
      await result.current.start();
    });
    expect(order).toEqual(['engine.start']);
    expect(getUserMedia).not.toHaveBeenCalled();

    act(() => emitter.emit({ type: 'ready' }));
    expect(result.current.status).toBe('listening');

    act(() => emitter.emit({ type: 'interim', text: 'there' }));
    expect(textarea.value).toBe('Hi there');
    act(() => emitter.emit({ type: 'final', text: 'there friend' }));
    expect(textarea.value).toBe('Hi there friend');

    await act(async () => {
      await result.current.stop();
    });
    expect(result.current.status).toBe('idle');
    expect(track.stop).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('mints the provider session only after the mic is granted', async () => {
    resetSttEngines();
    registerEngine(true);
    mint.mockImplementation(async () => {
      order.push('mint');
      return { client_secret: 'ek_x' };
    });
    const { result } = setup();

    await act(async () => {
      await result.current.start();
    });
    expect(order).toEqual(['getUserMedia', 'mint', 'engine.start']);
  });

  it('reports a blocked microphone without starting the engine', async () => {
    resetSttEngines();
    registerEngine(true);
    getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error('blocked'), { name: 'NotAllowedError' }),
    );
    const { result } = setup();

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error?.code).toBe('permission-denied');
    expect(engine.start).not.toHaveBeenCalled();
  });

  it('stops when the user types, keeping what was dictated', async () => {
    const { result } = setup(makeConfig({ auto_send_on_stop: true }));
    await act(async () => {
      await result.current.start();
    });
    act(() => emitter.emit({ type: 'final', text: 'dictated' }));

    await act(async () => {
      textarea.value = `${textarea.value} typed`;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(result.current.status).toBe('idle');
    expect(textarea.value).toBe('Hi dictated typed');
    // Typing is not a "stop" the user meant as "send".
    expect(submit).not.toHaveBeenCalled();
  });

  it('Escape cancels and restores the text from before dictation', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    act(() => emitter.emit({ type: 'final', text: 'never mind' }));
    expect(textarea.value).toBe('Hi never mind');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(textarea.value).toBe('Hi');
    expect(result.current.status).toBe('idle');
    expect(session.abort).toHaveBeenCalled();
  });

  it('auto-sends on stop when enabled and nothing is running', async () => {
    const { result } = setup(makeConfig({ auto_send_on_stop: true }));
    await act(async () => {
      await result.current.start();
    });
    act(() => emitter.emit({ type: 'final', text: 'send this' }));
    await act(async () => {
      await result.current.stop();
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does not auto-send while the agent is still answering', async () => {
    threadRunning = true;
    const { result } = setup(makeConfig({ auto_send_on_stop: true }));
    await act(async () => {
      await result.current.start();
    });
    act(() => emitter.emit({ type: 'final', text: 'send this' }));
    await act(async () => {
      await result.current.stop();
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('drops live text and surfaces engine errors', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.start();
    });
    act(() => emitter.emit({ type: 'interim', text: 'half a thou' }));
    act(() =>
      emitter.emit({
        type: 'error',
        error: { code: 'network', message: 'lost', retryable: true },
      }),
    );
    expect(result.current.status).toBe('error');
    expect(textarea.value).toBe('Hi');
  });

  it('is unavailable when dictation is turned off', () => {
    const { result } = setup(makeConfig({ enabled: false }));
    expect(result.current.available).toBe(false);
  });
});
