import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpeechConfig, SpeechPreferences } from '../../../api/speech';
import { registerSttEngine, resetSttEngines } from '../engines/registry';
import type { SttEngine } from '../engines/types';
import { resolveEngine } from '../resolveEngine';

function engine(id: string, supported: boolean): SttEngine {
  return {
    id,
    label: id,
    kind: id === 'webspeech' ? 'browser' : 'remote',
    needsServerSession: id !== 'webspeech',
    isSupported: () => supported,
    start: vi.fn(),
  };
}

function config(preferences: Partial<SpeechPreferences> = {}): SpeechConfig {
  return {
    workspace_id: 'ws-1',
    workspace_role: 'member',
    preferences: {
      enabled: true,
      engine: 'auto',
      language: 'auto',
      hotkey: 'Mod+Shift+Space',
      hotkey_mode: 'hold_or_toggle',
      auto_send_on_stop: false,
      silence_timeout_seconds: 8,
      ...preferences,
    },
    engines: [
      {
        engine: 'openai-realtime',
        source: 'workspace',
        display_name: 'OpenAI',
        streaming: true,
        privacy_note: null,
      },
      {
        engine: 'webspeech',
        source: 'browser',
        display_name: 'Browser',
        streaming: true,
        privacy_note: 'vendor',
      },
    ],
    preferred_engine: 'openai-realtime',
    provider: {
      configured: true,
      available_to_you: true,
      provider: 'openai',
      model: 'gpt-live-transcribe',
      source: 'byok',
    },
    limits: { max_session_seconds: 300, session_ttl_seconds: 60 },
  };
}

describe('resolveEngine', () => {
  beforeEach(() => resetSttEngines());
  afterEach(() => resetSttEngines());

  it('prefers the workspace provider when the browser supports it', () => {
    registerSttEngine(engine('openai-realtime', true));
    registerSttEngine(engine('webspeech', true));
    expect(resolveEngine(config())?.source).toBe('workspace');
  });

  it('falls back to browser recognition when the provider engine is unsupported', () => {
    registerSttEngine(engine('openai-realtime', false));
    registerSttEngine(engine('webspeech', true));
    expect(resolveEngine(config())?.engine.id).toBe('webspeech');
  });

  it('never spends the workspace provider against a browser preference', () => {
    registerSttEngine(engine('openai-realtime', true));
    registerSttEngine(engine('webspeech', false));
    expect(resolveEngine(config({ engine: 'browser' }))).toBeNull();
  });

  it('returns nothing when dictation is off or config is missing', () => {
    registerSttEngine(engine('webspeech', true));
    expect(resolveEngine(config({ enabled: false }))).toBeNull();
    expect(resolveEngine(undefined)).toBeNull();
  });
});
