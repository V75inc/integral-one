import type { ModelProvider, SpeechProvider } from './modelCredentials';

export interface ModelPreset {
  id: string;
  label: string;
  recommended?: boolean;
}

export const RECOMMENDED_MODELS: Record<ModelProvider, ModelPreset[]> = {
  openai: [
    { id: 'gpt-4.1', label: 'GPT-4.1', recommended: true },
    { id: 'gpt-4o', label: 'GPT-4o' },
  ],
  anthropic: [
    {
      id: 'claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
      recommended: true,
    },
    { id: 'claude-3-7-sonnet-latest', label: 'Claude 3.7 Sonnet' },
  ],
  openrouter: [
    { id: 'openai/gpt-4.1', label: 'OpenAI GPT-4.1', recommended: true },
  ],
  ollama: [
    {
      id: 'deepseek-v4.1-flash',
      label: 'DeepSeek V4.1 Flash (Ollama Cloud)',
      recommended: true,
    },
    { id: 'gpt-oss:120b', label: 'gpt-oss 120b (cloud)' },
  ],
  ollama_local: [
    { id: 'gemma4:e2b', label: 'Gemma 4 E2B (local)', recommended: true },
    { id: 'gemma4:26b', label: 'Gemma 4 26B (local)' },
  ],
  // Custom OpenAI-compatible endpoints have no known model catalog, so the
  // dropdown is empty and the UI falls through to the custom model ID input.
  custom_openai: [],
};

/**
 * Voice input (speech-to-text) models, keyed by speech-capable provider.
 * Kept apart from RECOMMENDED_MODELS: only a subset of providers can
 * transcribe, so voice input is configured separately from the primary chat model.
 */
export const SPEECH_MODEL_PRESETS: Record<SpeechProvider, ModelPreset[]> = {
  openai: [
    {
      id: 'gpt-live-transcribe',
      label: 'GPT Live Transcribe (streams as you talk)',
      recommended: true,
    },
    { id: 'gpt-transcribe', label: 'GPT Transcribe (after each pause)' },
  ],
};

export function defaultSpeechModel(provider: SpeechProvider): string {
  const presets = SPEECH_MODEL_PRESETS[provider];
  return presets.find(p => p.recommended)?.id ?? presets[0]?.id ?? '';
}

export function defaultModel(provider: ModelProvider): string {
  const presets = RECOMMENDED_MODELS[provider];
  return presets.find(p => p.recommended)?.id ?? presets[0]?.id ?? '';
}
