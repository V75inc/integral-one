/**
 * In-browser recognition through the Web Speech API.
 *
 * Zero configuration, but not necessarily private: Chrome and Edge send the
 * audio to Google / Microsoft, Safari to Apple. Firefox has no implementation,
 * so `isSupported()` is false there and the mic hides unless the workspace
 * has a provider.
 *
 * The API opens the microphone itself; the caller's stream is only used for
 * the level meter and silence detection.
 */
import { createEmitter } from './emitter';
import { sttError, type SttEngine, type SttError, type SttEvent } from './types';

/** Ceiling on stop(): some browsers never deliver `onend` after stop(). */
const STOP_DRAIN_TIMEOUT_MS = 1500;

interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionResultEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  readonly error: string;
}
export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  lang: string;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Web Speech wants a full tag; `auto` means the browser's own language. */
export function browserRecognitionLanguage(language?: string): string {
  if (language && language !== 'auto') return language;
  return (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
}

function mapError(code: string): SttError {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return sttError('permission-denied', 'Microphone access was blocked.');
    case 'audio-capture':
      return sttError('no-device', 'No microphone was found.');
    case 'network':
      return sttError(
        'network',
        "Your browser's speech service couldn't be reached.",
        true,
      );
    case 'language-not-supported':
      return sttError('unsupported', "Your browser can't recognize that language.");
    default:
      return sttError('unknown', 'Speech recognition stopped unexpectedly.', true);
  }
}

export const webSpeechEngine: SttEngine = {
  id: 'webspeech',
  label: 'Browser speech recognition',
  kind: 'browser',
  needsServerSession: false,
  isSupported: () => recognitionCtor() !== null,

  async start({ language }) {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      throw sttError('unsupported', "This browser doesn't support speech recognition.");
    }
    const emitter = createEmitter<SttEvent>();
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.lang = browserRecognitionLanguage(language);

    let stopping = false;
    let aborted = false;
    let ended = false;
    // Some implementations (Android Chrome) re-deliver earlier finals.
    let lastFinalIndex = -1;

    rec.onstart = () => emitter.emit({ type: 'ready' });
    rec.onspeechstart = () => emitter.emit({ type: 'speech-start' });
    rec.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          if (i > lastFinalIndex && text.trim()) {
            lastFinalIndex = i;
            emitter.emit({ type: 'final', text: text.trim() });
          }
        } else {
          interim += text;
        }
      }
      emitter.emit({ type: 'interim', text: interim.trim() });
    };
    rec.onerror = event => {
      // `no-speech` fires after a quiet stretch; the auto-restart below keeps
      // listening, and silence auto-stop is the hook's job. `aborted` is ours.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      stopping = true;
      emitter.emit({ type: 'error', error: mapError(event.error) });
    };
    rec.onend = () => {
      // Chrome ends a "continuous" session after ~60s or a pause. Restart
      // unless we asked it to stop.
      if (!stopping) {
        try {
          lastFinalIndex = -1;
          rec.start();
          return;
        } catch {
          // fall through to end
        }
      }
      if (ended) return;
      ended = true;
      emitter.emit({ type: 'end', reason: aborted ? 'aborted' : 'stopped' });
    };

    try {
      rec.start();
    } catch (cause) {
      throw sttError('device-busy', 'Speech recognition is already running.', true, cause);
    }

    return {
      on: emitter.on,
      stop: () =>
        new Promise<void>(resolve => {
          if (ended) {
            resolve();
            return;
          }
          stopping = true;
          // `end` normally settles this, but some implementations never fire
          // `onend` after stop(). Without a ceiling the promise never
          // resolves — and because useDictation awaits it and finishes the
          // run in a `finally`, that left the UI stuck on "stopping" and
          // silently skipped auto-send. Mirrors the OpenAI engine's drain.
          let settled = false;
          let off: (() => void) | null = null;
          let timer: ReturnType<typeof setTimeout> | null = null;
          const finish = () => {
            if (settled) return;
            settled = true;
            if (timer !== null) clearTimeout(timer);
            off?.();
            resolve();
          };
          off = emitter.on(event => {
            if (event.type === 'end') finish();
          });
          timer = setTimeout(finish, STOP_DRAIN_TIMEOUT_MS);
          rec.stop();
        }),
      abort: () => {
        if (ended) return;
        stopping = true;
        aborted = true;
        rec.abort();
      },
    };
  },
};
