/**
 * Voice input API — effective config, session minting, per-user preferences.
 *
 * Hand-mirrors backend/app/schemas/agentive/speech.py and
 * backend/app/schemas/speech_preferences.py. Every call opts out of the
 * system notification bar: the composer and the settings panel report speech
 * errors inline, and a missing provider is a normal state, not an outage.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useScope } from '../context/ScopeContext';
import apiClient from './client';

export type SpeechEngineChoice = 'auto' | 'browser';
export type HotkeyMode = 'hold_or_toggle' | 'toggle' | 'hold';

export interface SpeechPreferences {
  enabled: boolean;
  engine: SpeechEngineChoice;
  /** `auto` or a BCP-47 tag such as `en-US`. */
  language: string;
  /** `Mod+Shift+Space`-style chord; `Mod` is ⌘ on macOS, Ctrl elsewhere. */
  hotkey: string;
  hotkey_mode: HotkeyMode;
  auto_send_on_stop: boolean;
  /** Seconds of silence before dictation stops; 0 disables. */
  silence_timeout_seconds: number;
}

export interface SpeechEngineOption {
  engine: string;
  source: 'workspace' | 'browser';
  display_name: string;
  streaming: boolean;
  privacy_note: string | null;
}

export interface SpeechProviderStatus {
  configured: boolean;
  available_to_you: boolean;
  provider: string | null;
  model: string | null;
  source: 'byok' | 'platform' | null;
}

export interface SpeechConfig {
  workspace_id: string;
  workspace_role: string;
  preferences: SpeechPreferences;
  /** Recognizers the caller may use, workspace provider first. */
  engines: SpeechEngineOption[];
  preferred_engine: string | null;
  provider: SpeechProviderStatus;
  limits: { max_session_seconds: number; session_ttl_seconds: number };
}

/** Short-lived browser credential — never the provider API key. */
export interface SpeechSessionResponse {
  engine: string;
  transport: 'webrtc' | 'websocket';
  connect_url: string;
  client_secret: string;
  expires_at: string;
  params: Record<string, unknown>;
  max_session_seconds: number;
}

const QUIET = { __suppressSystemNotify: true } as never;

export const SPEECH_CONFIG_QUERY_ROOT = ['speech', 'config'] as const;
export const SPEECH_PREFS_KEY = ['speech', 'preferences'] as const;

export async function fetchSpeechConfig(): Promise<SpeechConfig> {
  const { data } = await apiClient.get<SpeechConfig>('/agentive/speech/config', QUIET);
  return data;
}

export async function mintSpeechSession(
  body: { language?: string } = {},
): Promise<SpeechSessionResponse> {
  const { data } = await apiClient.post<SpeechSessionResponse>(
    '/agentive/speech/session',
    body,
    QUIET,
  );
  return data;
}

export async function fetchSpeechPreferences(): Promise<SpeechPreferences> {
  const { data } = await apiClient.get<SpeechPreferences>(
    '/users/me/speech-preferences',
    QUIET,
  );
  return data;
}

export async function patchSpeechPreferences(
  partial: Partial<SpeechPreferences>,
): Promise<SpeechPreferences> {
  const { data } = await apiClient.patch<SpeechPreferences>(
    '/users/me/speech-preferences',
    partial,
    QUIET,
  );
  return data;
}

/** Effective config for the active workspace; refetches on workspace switch. */
export function useSpeechConfig() {
  const { activeWorkspace } = useScope();
  return useQuery<SpeechConfig>({
    queryKey: [...SPEECH_CONFIG_QUERY_ROOT, activeWorkspace?.id ?? null],
    queryFn: fetchSpeechConfig,
    staleTime: 60_000,
    retry: false,
  });
}

export function useSpeechPreferences() {
  return useQuery<SpeechPreferences>({
    queryKey: SPEECH_PREFS_KEY,
    queryFn: fetchSpeechPreferences,
  });
}

export function useUpdateSpeechPreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchSpeechPreferences,
    onSuccess: data => {
      qc.setQueryData(SPEECH_PREFS_KEY, data);
      void qc.invalidateQueries({ queryKey: SPEECH_CONFIG_QUERY_ROOT });
    },
  });
}
