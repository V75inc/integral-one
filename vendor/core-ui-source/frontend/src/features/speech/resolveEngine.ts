/**
 * Pick the recognizer for this browser from the server's ordered list.
 *
 * The server lists what the caller may use (workspace provider first, never
 * for guests); only the browser knows what it supports (no Web Speech on
 * Firefox, no WebRTC in some embedded views). An explicit `browser`
 * preference never falls back to the workspace provider — that would spend
 * the owner's quota against the user's choice.
 */
import type { SpeechConfig } from '../../api/speech';
import { getSttEngine } from './engines/registry';
import type { SttEngine } from './engines/types';

export interface ResolvedEngine {
  engine: SttEngine;
  source: 'workspace' | 'browser';
}

export function resolveEngine(config: SpeechConfig | null | undefined): ResolvedEngine | null {
  if (!config || !config.preferences.enabled) return null;
  const options =
    config.preferences.engine === 'browser'
      ? config.engines.filter(option => option.source === 'browser')
      : config.engines;
  for (const option of options) {
    const engine = getSttEngine(option.engine);
    if (engine?.isSupported()) return { engine, source: option.source };
  }
  return null;
}
