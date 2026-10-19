import api from './client';

export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'ollama'
  | 'ollama_local'
  | 'custom_openai';

/** Providers that can back voice input (mirrors backend SpeechProvider). */
export type SpeechProvider = Extract<ModelProvider, 'openai'>;
export const SPEECH_CAPABLE_PROVIDERS: readonly SpeechProvider[] = ['openai'];

export function isSpeechProvider(
  provider: ModelProvider | null | undefined,
): provider is SpeechProvider {
  return !!provider && (SPEECH_CAPABLE_PROVIDERS as readonly string[]).includes(provider);
}

export interface ModelCredential {
  provider: ModelProvider;
  model: string;
  base_url?: string | null;
  speech_provider?: ModelProvider | null;
  speech_model?: string | null;
  key_fingerprint: string;
  speech_key_fingerprint?: string | null;
  is_active: boolean;
  validated_at?: string | null;
  last_used_at?: string | null;
  updated_at?: string | null;
}

export interface ModelCredentialUpsertBody {
  provider: ModelProvider;
  model: string;
  /** Omit to retain only for the same provider and endpoint. */
  api_key?: string;
  /** Explicitly remove the saved key for a custom endpoint. */
  clear_api_key?: boolean;
  /** Custom OpenAI-compatible base URL (required for custom_openai). */
  base_url?: string;
  /** Voice input. Empty string turns the slot off. */
  speech_model?: string;
  speech_provider?: ModelProvider;
  speech_api_key?: string;
}

export interface ModelCredentialValidateBody {
  provider: ModelProvider;
  api_key?: string;
  base_url?: string;
}

export const modelCredentialsApi = {
  async get(): Promise<ModelCredential | null> {
    const res = await api.get<{ credential: ModelCredential | null }>(
      '/users/me/model-credentials',
    );
    return res.data.credential;
  },

  async upsert(body: ModelCredentialUpsertBody): Promise<ModelCredential> {
    const res = await api.post<{ credential: ModelCredential }>(
      '/users/me/model-credentials',
      body,
    );
    return res.data.credential;
  },

  async revoke(): Promise<void> {
    await api.delete('/users/me/model-credentials');
  },

  async validate(
    body: ModelCredentialValidateBody,
  ): Promise<{ valid: boolean; message: string }> {
    const res = await api.post<{ valid: boolean; message: string }>(
      '/users/me/model-credentials/validate',
      body,
    );
    return res.data;
  },
};

export const PROVIDER_CONSOLE_URLS: Partial<Record<ModelProvider, string>> = {
  openai: 'https://platform.openai.com/api-keys',
  anthropic: 'https://console.anthropic.com/settings/keys',
  openrouter: 'https://openrouter.ai/keys',
  ollama: 'https://ollama.com/settings/keys',
};

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  ollama: 'Ollama Cloud',
  ollama_local: 'Ollama (Local)',
  custom_openai: 'Custom (OpenAI-compatible)',
};

/** User-facing model role labels (AI Models settings). */
export const MODEL_SLOT_LABELS = {
  default: 'Primary',
  speech: 'Voice input',
} as const;

export const MODEL_SLOT_HINTS = {
  default: 'Your main model for everyday chat and most answers.',
  speech:
    'Turns speech into text in the chat box. Everyone in workspaces you own dictates on this key.',
} as const;

/** Plain-language labels for workspace key policy (from agent_key_mode). */
export const AGENT_KEY_MODE_LABELS: Record<string, string> = {
  hybrid: 'Your keys when set, otherwise shared',
  byo_strict: 'Your keys required',
  platform_only: 'Shared keys only',
};
