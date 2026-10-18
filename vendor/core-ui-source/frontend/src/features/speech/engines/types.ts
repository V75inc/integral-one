/**
 * Speech-to-text engine contract for the chat composer.
 *
 * An engine turns a microphone stream into transcript events. Engines are
 * looked up by id, and a provider-backed engine's id matches the backend
 * adapter's `client_engine` (e.g. `openai-realtime`). Adding a provider is
 * one backend adapter plus one engine here — the composer never changes.
 */
import type { SpeechSessionResponse } from '../../../api/speech';

export type SttEngineId = string;

export type SttErrorCode =
  | 'permission-denied'
  | 'no-device'
  | 'device-busy'
  | 'insecure-context'
  | 'unsupported'
  | 'network'
  | 'provider-auth'
  | 'provider-unavailable'
  | 'not-configured'
  | 'rate-limited'
  | 'unknown';

export interface SttError {
  code: SttErrorCode;
  /** User-facing sentence. */
  message: string;
  retryable: boolean;
  cause?: unknown;
}

export type SttEndReason = 'stopped' | 'aborted' | 'remote-closed';

export type SttEvent =
  | { type: 'ready' }
  /** Replaces the current not-yet-final text. `''` clears it. */
  | { type: 'interim'; text: string }
  /** Committed text; the composer appends it and clears the interim text. */
  | { type: 'final'; text: string }
  | { type: 'speech-start' }
  | { type: 'error'; error: SttError }
  | { type: 'end'; reason: SttEndReason };

export interface SttStartOptions {
  /** Mic stream the caller acquired (engines never stop its tracks).
   *  Optional for browser engines that open their own capture. */
  stream?: MediaStream | null;
  /** BCP-47 tag; undefined means the engine's default / auto-detect. */
  language?: string;
  /** Short-lived credential for provider-backed engines. */
  session?: SpeechSessionResponse;
}

export interface SttSession {
  on(listener: (event: SttEvent) => void): () => void;
  /** Stop listening, flush pending text, then emit `end: stopped`. */
  stop(): Promise<void>;
  /** Tear down immediately and emit `end: aborted`. */
  abort(): void;
}

export interface SttEngine {
  id: SttEngineId;
  label: string;
  kind: 'browser' | 'remote';
  /** Whether `start` needs a session minted by `/agentive/speech/session`. */
  needsServerSession: boolean;
  isSupported(): boolean;
  start(opts: SttStartOptions): Promise<SttSession>;
}

export function sttError(
  code: SttErrorCode,
  message: string,
  retryable = false,
  cause?: unknown,
): SttError {
  return { code, message, retryable, cause };
}

export function isSttError(value: unknown): value is SttError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'retryable' in value
  );
}
