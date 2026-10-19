import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SttEvent } from '../engines/types';
import { webSpeechEngine } from '../engines/webSpeechEngine';

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  lang = '';
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn(() => this.onend?.());
  constructor() {
    FakeRecognition.instances.push(this);
  }
}

function results(resultIndex: number, items: Array<[string, boolean]>) {
  return {
    resultIndex,
    results: items.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
  };
}

const STREAM = {} as MediaStream;

describe('webSpeechEngine', () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves stop() even when the recognizer never delivers onend', async () => {
    // Some implementations never fire `onend` after stop(). Without a ceiling
    // the promise never settled — and because useDictation awaits it and
    // finishes the run in a `finally`, the UI sat on "stopping" forever and
    // auto-send never ran.
    vi.useFakeTimers();
    try {
      const session = await webSpeechEngine.start({ stream: STREAM });
      const rec = FakeRecognition.instances[0];
      rec.stop = vi.fn(); // deliberately silent — no onend

      let settled = false;
      const stopping = session.stop().then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);

      await vi.advanceTimersByTimeAsync(1500);
      await stopping;
      expect(settled).toBe(true);
      expect(rec.stop).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears the drain timer when end arrives normally', async () => {
    // The happy path must not leave a stray timer behind.
    vi.useFakeTimers();
    try {
      const session = await webSpeechEngine.start({ stream: STREAM });
      await session.stop(); // the fake fires onend synchronously
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is unsupported without a recognizer (Firefox)', () => {
    vi.unstubAllGlobals();
    expect(webSpeechEngine.isSupported()).toBe(false);
  });

  it('streams interim text and commits each final once', async () => {
    const session = await webSpeechEngine.start({ stream: STREAM, language: 'en-GB' });
    const rec = FakeRecognition.instances[0];
    expect(rec.lang).toBe('en-GB');
    expect(rec.continuous).toBe(true);
    expect(rec.interimResults).toBe(true);

    const events: SttEvent[] = [];
    session.on(event => events.push(event));
    rec.onresult?.(results(0, [['hello wor', false]]));
    rec.onresult?.(results(0, [['hello world', true]]));
    // Android re-delivers earlier finals; they must not be committed twice.
    rec.onresult?.(results(0, [['hello world', true], ['again', false]]));

    expect(events).toEqual([
      { type: 'interim', text: 'hello wor' },
      { type: 'final', text: 'hello world' },
      { type: 'interim', text: '' },
      { type: 'interim', text: 'again' },
    ]);
  });

  it('restarts when the browser ends a session on its own', async () => {
    await webSpeechEngine.start({ stream: STREAM });
    const rec = FakeRecognition.instances[0];
    rec.onend?.();
    expect(rec.start).toHaveBeenCalledTimes(2);
  });

  it('stops cleanly', async () => {
    const session = await webSpeechEngine.start({ stream: STREAM });
    const events: SttEvent[] = [];
    session.on(event => events.push(event));
    await session.stop();
    expect(events[events.length - 1]).toEqual({ type: 'end', reason: 'stopped' });
  });

  it('reports a blocked microphone and does not restart', async () => {
    const session = await webSpeechEngine.start({ stream: STREAM });
    const rec = FakeRecognition.instances[0];
    const events: SttEvent[] = [];
    session.on(event => events.push(event));

    rec.onerror?.({ error: 'no-speech' });
    expect(events).toEqual([]);

    rec.onerror?.({ error: 'not-allowed' });
    rec.onend?.();
    expect(events[0]).toMatchObject({ type: 'error', error: { code: 'permission-denied' } });
    expect(events[events.length - 1]).toEqual({ type: 'end', reason: 'stopped' });
    expect(rec.start).toHaveBeenCalledTimes(1);
  });
});
