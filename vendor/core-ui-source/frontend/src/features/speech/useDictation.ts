/**
 * Dictation into the chat composer: microphone, engine and text lifecycle.
 *
 * Order matters on start — microphone first, then the server session, then
 * the engine. A permission prompt can outlast a session credential's
 * lifetime, so nothing is minted until the user has said yes.
 *
 * Text goes straight into the textarea (see insertTranscript.ts). Typing
 * while dictating stops dictation and keeps what was said; Escape cancels and
 * restores the text as it was before dictation began.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  mintSpeechSession,
  type SpeechConfig,
  type SpeechSessionResponse,
} from '../../api/speech';
import { setComposerValue } from '../ai-chat/components/composerDom';
import { SPEAKING_LEVEL, startLevelMeter, type LevelMeter } from './audio/levelMeter';
import {
  dictationReducer,
  INITIAL_DICTATION_STATE,
  type DictationStatus,
} from './dictationMachine';
import {
  isSttError,
  sttError,
  type SttEngine,
  type SttError,
  type SttEvent,
  type SttSession,
} from './engines/types';
import {
  applyFinal,
  applyInterim,
  beginDictation,
  committedText,
  type DictationAnchor,
} from './insertTranscript';
import { resolveEngine } from './resolveEngine';

/** Why dictation stopped. Only `user` and `silence` may auto-send. */
export type StopCause = 'user' | 'silence' | 'max-duration' | 'hidden' | 'typing' | 'submit';

export interface DictationController {
  status: DictationStatus;
  error: SttError | null;
  /** 0..1 microphone level while capturing. */
  level: number;
  engine: SttEngine | null;
  engineSource: 'workspace' | 'browser' | null;
  /** A recognizer is usable here (preference on, engine supported). */
  available: boolean;
  /** Capturing or about to (includes permission and connecting). */
  isListening(): boolean;
  start(): Promise<void>;
  stop(cause?: StopCause): Promise<void>;
  cancel(): void;
  toggle(): void;
}

export interface UseDictationOptions {
  config: SpeechConfig | undefined;
  getTextarea: () => HTMLTextAreaElement | null;
  submit: () => void;
  isThreadRunning: () => boolean;
}

interface ActiveRun {
  stream: MediaStream | null;
  meter: LevelMeter | null;
  session: SttSession | null;
  unsubscribe: (() => void) | null;
  detachInput: (() => void) | null;
  anchor: DictationAnchor;
  snapshot: string;
  snapshotCaret: number;
  lastVoiceAt: number;
  maxTimer: ReturnType<typeof setTimeout> | null;
  silenceTimer: ReturnType<typeof setInterval> | null;
  stopCause: StopCause | null;
  /** True while we are writing, so our own input events aren't "typing". */
  writing: boolean;
}

export function mapMediaError(error: unknown): SttError {
  const name = (error as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return sttError(
        'permission-denied',
        "Microphone access is blocked. Allow it in your browser's site settings to dictate.",
        false,
        error,
      );
    case 'NotFoundError':
    case 'OverconstrainedError':
      return sttError('no-device', 'No microphone was found.', false, error);
    case 'NotReadableError':
    case 'AbortError':
      return sttError('device-busy', 'The microphone is in use by another app.', true, error);
    default:
      return sttError('unknown', "The microphone couldn't be opened.", true, error);
  }
}

export function mapSessionError(error: unknown): SttError {
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  switch (status) {
    case 409:
      return sttError(
        'not-configured',
        'This workspace has no speech-to-text provider set up.',
        false,
        error,
      );
    case 403:
      return sttError(
        'not-configured',
        "The workspace's speech-to-text provider is for its members.",
        false,
        error,
      );
    case 429:
      return sttError(
        'rate-limited',
        'Too many voice sessions — wait a moment and try again.',
        true,
        error,
      );
    case 503:
      return sttError(
        'provider-unavailable',
        'The speech-to-text provider is unavailable right now.',
        true,
        error,
      );
    case undefined:
      return sttError('network', "Couldn't reach Integral to start voice input.", true, error);
    default:
      return sttError('unknown', "Voice input couldn't start.", true, error);
  }
}

export function useDictation({
  config,
  getTextarea,
  submit,
  isThreadRunning,
}: UseDictationOptions): DictationController {
  const [state, dispatch] = useReducer(dictationReducer, INITIAL_DICTATION_STATE);
  const [level, setLevel] = useState(0);
  const resolved = useMemo(() => resolveEngine(config), [config]);

  const runRef = useRef<ActiveRun | null>(null);
  const statusRef = useRef<DictationStatus>(state.status);
  statusRef.current = state.status;
  const latest = useRef({ config, resolved, getTextarea, submit, isThreadRunning });
  latest.current = { config, resolved, getTextarea, submit, isThreadRunning };

  const write = useCallback((run: ActiveRun, value: string, caret: number) => {
    const el = latest.current.getTextarea();
    if (!el) return;
    run.writing = true;
    try {
      setComposerValue(el, value, caret);
    } finally {
      run.writing = false;
    }
  }, []);

  const teardown = useCallback((run: ActiveRun) => {
    if (runRef.current === run) runRef.current = null;
    run.unsubscribe?.();
    run.detachInput?.();
    run.meter?.stop();
    if (run.maxTimer) clearTimeout(run.maxTimer);
    if (run.silenceTimer) clearInterval(run.silenceTimer);
    if (run.stream) {
      for (const track of run.stream.getTracks()) track.stop();
    }
    setLevel(0);
  }, []);

  const dropInterim = useCallback(
    (run: ActiveRun) => {
      const el = latest.current.getTextarea();
      if (!el || run.anchor.interimLen === 0) return;
      const edit = applyInterim(el.value, run.anchor, '');
      run.anchor = edit.anchor;
      write(run, edit.value, edit.caret);
    },
    [write],
  );

  const finishRun = useCallback(
    (run: ActiveRun) => {
      if (runRef.current !== run) return;
      dropInterim(run);
      const el = latest.current.getTextarea();
      const text = el ? committedText(el.value, run.anchor) : '';
      const cause = run.stopCause;
      teardown(run);
      dispatch({ type: 'ended' });
      const prefs = latest.current.config?.preferences;
      if (
        prefs?.auto_send_on_stop &&
        text &&
        (cause === 'user' || cause === 'silence') &&
        !latest.current.isThreadRunning()
      ) {
        latest.current.submit();
      }
    },
    [dropInterim, teardown],
  );

  const stop = useCallback(
    async (cause: StopCause = 'user') => {
      const run = runRef.current;
      if (!run || run.stopCause) return;
      run.stopCause = cause;
      dispatch({ type: 'stop' });
      if (!run.session) {
        // Still acquiring the mic or minting — `start` sees the run is gone.
        finishRun(run);
        return;
      }
      try {
        await run.session.stop();
      } finally {
        // The engine's `end` normally finishes the run; this covers engines
        // that resolve `stop()` without emitting it.
        finishRun(run);
      }
    },
    [finishRun],
  );

  const handleEvent = useCallback(
    (run: ActiveRun, event: SttEvent) => {
      if (runRef.current !== run) return;
      const el = latest.current.getTextarea();
      switch (event.type) {
        case 'ready':
          dispatch({ type: 'ready' });
          break;
        case 'speech-start':
          run.lastVoiceAt = Date.now();
          break;
        case 'interim': {
          if (event.text.trim()) run.lastVoiceAt = Date.now();
          if (!el) break;
          const edit = applyInterim(el.value, run.anchor, event.text);
          run.anchor = edit.anchor;
          write(run, edit.value, edit.caret);
          break;
        }
        case 'final': {
          run.lastVoiceAt = Date.now();
          if (!el) break;
          const edit = applyFinal(el.value, run.anchor, event.text);
          run.anchor = edit.anchor;
          write(run, edit.value, edit.caret);
          break;
        }
        case 'error':
          dropInterim(run);
          teardown(run);
          run.session?.abort();
          dispatch({ type: 'fail', error: event.error });
          break;
        case 'end':
          finishRun(run);
          break;
        default:
          break;
      }
    },
    [dropInterim, finishRun, teardown, write],
  );

  const start = useCallback(async () => {
    if (runRef.current) return;
    const { resolved: choice, config: cfg } = latest.current;
    const initialEl = latest.current.getTextarea();
    if (!choice || !cfg || !initialEl) return;

    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      dispatch({
        type: 'fail',
        error: sttError('insecure-context', 'Voice input needs a secure (https) connection.'),
      });
      return;
    }

    // Browser engines (Web Speech) open their own mic capture via
    // recognition.start(). Opening a second getUserMedia stream for the
    // level meter races the device and can throw NotReadableError / device-busy.
    const usesOwnCapture = choice.engine.kind === 'browser';
    if (
      !usesOwnCapture &&
      (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia)
    ) {
      dispatch({
        type: 'fail',
        error: sttError('unsupported', "This browser can't capture audio."),
      });
      return;
    }

    dispatch({ type: 'start' });
    let stream: MediaStream | null = null;
    if (!usesOwnCapture) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch (error) {
        dispatch({ type: 'fail', error: mapMediaError(error) });
        return;
      }
    }

    const target = latest.current.getTextarea() ?? initialEl;
    const snapshot = target.value;
    const selectionStart = target.selectionStart ?? snapshot.length;
    const selectionEnd = target.selectionEnd ?? selectionStart;
    const begun = beginDictation(snapshot, selectionStart, selectionEnd);
    const run: ActiveRun = {
      stream,
      meter: null,
      session: null,
      unsubscribe: null,
      detachInput: null,
      anchor: begun.anchor,
      snapshot,
      snapshotCaret: selectionStart,
      lastVoiceAt: Date.now(),
      maxTimer: null,
      silenceTimer: null,
      stopCause: null,
      writing: false,
    };
    runRef.current = run;
    dispatch({ type: 'permission-granted' });
    if (begun.value !== snapshot) write(run, begun.value, begun.anchor.start);

    const onInput = () => {
      if (!run.writing && runRef.current === run) void stop('typing');
    };
    target.addEventListener('input', onInput);
    run.detachInput = () => target.removeEventListener('input', onInput);

    const silenceMs = Math.max(0, cfg.preferences.silence_timeout_seconds) * 1000;
    if (stream) {
      run.meter = startLevelMeter(stream, value => {
        setLevel(value);
        const now = Date.now();
        if (value >= SPEAKING_LEVEL) {
          run.lastVoiceAt = now;
        } else if (
          silenceMs > 0 &&
          statusRef.current === 'listening' &&
          now - run.lastVoiceAt > silenceMs
        ) {
          void stop('silence');
        }
      });
    } else if (silenceMs > 0) {
      // No level meter on browser engines — silence from recognition events.
      run.silenceTimer = setInterval(() => {
        if (
          statusRef.current === 'listening' &&
          Date.now() - run.lastVoiceAt > silenceMs
        ) {
          void stop('silence');
        }
      }, 250);
    }
    run.maxTimer = setTimeout(
      () => void stop('max-duration'),
      cfg.limits.max_session_seconds * 1000,
    );

    let session: SpeechSessionResponse | undefined;
    if (choice.engine.needsServerSession) {
      try {
        // The server applies the caller's language preference.
        session = await mintSpeechSession();
      } catch (error) {
        if (runRef.current === run) {
          teardown(run);
          dispatch({ type: 'fail', error: mapSessionError(error) });
        }
        return;
      }
      if (runRef.current !== run) return;
    }

    const language =
      cfg.preferences.language === 'auto' ? undefined : cfg.preferences.language;
    let sttSession: SttSession;
    try {
      sttSession = await choice.engine.start({ stream, language, session });
    } catch (error) {
      if (runRef.current === run) {
        teardown(run);
        dispatch({
          type: 'fail',
          error: isSttError(error)
            ? error
            : sttError('unknown', "Voice input couldn't start.", true, error),
        });
      }
      return;
    }
    if (runRef.current !== run) {
      sttSession.abort();
      return;
    }
    run.session = sttSession;
    run.unsubscribe = sttSession.on(event => handleEvent(run, event));
  }, [handleEvent, stop, teardown, write]);

  const cancel = useCallback(() => {
    const run = runRef.current;
    if (!run) {
      dispatch({ type: 'reset' });
      return;
    }
    teardown(run);
    run.session?.abort();
    write(run, run.snapshot, run.snapshotCaret);
    dispatch({ type: 'reset' });
  }, [teardown, write]);

  const toggle = useCallback(() => {
    if (runRef.current) void stop('user');
    else void start();
  }, [start, stop]);

  const isListening = useCallback(() => runRef.current !== null, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void stop('hidden');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && runRef.current) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [cancel]);

  // Thread switch / composer unmount: release the microphone.
  useEffect(
    () => () => {
      const run = runRef.current;
      if (run) {
        teardown(run);
        run.session?.abort();
      }
    },
    [teardown],
  );

  return useMemo(
    () => ({
      status: state.status,
      error: state.error,
      level,
      engine: resolved?.engine ?? null,
      engineSource: resolved?.source ?? null,
      available: resolved !== null,
      isListening,
      start,
      stop,
      cancel,
      toggle,
    }),
    [state.status, state.error, level, resolved, isListening, start, stop, cancel, toggle],
  );
}
