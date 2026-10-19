/**
 * User-facing AI model and API key settings.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Sparkles, Trash2 } from 'lucide-react';

import {
  AGENT_KEY_MODE_LABELS,
  isSpeechProvider,
  MODEL_SLOT_HINTS,
  MODEL_SLOT_LABELS,
  modelCredentialsApi,
  PROVIDER_CONSOLE_URLS,
  PROVIDER_LABELS,
  SPEECH_CAPABLE_PROVIDERS,
  type ModelCredential,
  type ModelProvider,
  type SpeechProvider,
} from '../../../api/modelCredentials';
import {
  defaultModel,
  defaultSpeechModel,
  RECOMMENDED_MODELS,
  SPEECH_MODEL_PRESETS,
  type ModelPreset,
} from '../../../api/modelPresets';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../context/ToastContext';
import { errorMessageFromAxios } from '../../../api/helpers';
import { useAgentiveCapability } from '../hooks/useAgentiveCapability';
import { Input, Select, Stack, Surface, Text } from '../../../ui';
import { SettingsSection, StatusPill } from '../components/Field';

const QUERY_KEY = ['model-credentials', 'me'] as const;
const CUSTOM_MODEL_VALUE = '__custom__';

const PROVIDER_OPTIONS: { value: ModelProvider; label: string }[] = (
  Object.entries(PROVIDER_LABELS) as [ModelProvider, string][]
).map(([value, label]) => ({ value, label }));

function providerLabel(provider: ModelProvider): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function ModelSelect({
  provider,
  value,
  onChange,
}: {
  provider: ModelProvider;
  value: string;
  onChange: (modelId: string) => void;
}) {
  return (
    <PresetModelSelect
      presets={RECOMMENDED_MODELS[provider]}
      value={value}
      onChange={onChange}
    />
  );
}

/** Preset dropdown plus a "Custom model ID…" escape hatch. */
function PresetModelSelect({
  label = 'Chat model',
  presets,
  value,
  onChange,
}: {
  label?: string;
  presets: ModelPreset[];
  value: string;
  onChange: (modelId: string) => void;
}) {
  const presetIds = new Set(presets.map(p => p.id));
  const selectValue = presetIds.has(value) ? value : CUSTOM_MODEL_VALUE;

  return (
    <div className="flex flex-col gap-1">
      <Select
        aria-label={label}
        value={selectValue}
        onChange={e => {
          const next = e.target.value;
          if (next === CUSTOM_MODEL_VALUE) {
            if (presetIds.has(value)) onChange('');
            return;
          }
          onChange(next);
        }}
      >
        {presets.map((preset: ModelPreset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
            {preset.recommended ? ' (recommended)' : ''}
          </option>
        ))}
        <option value={CUSTOM_MODEL_VALUE}>Custom model ID…</option>
      </Select>
      {selectValue === CUSTOM_MODEL_VALUE ? (
        <Input
          aria-label={`${label} ID`}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="model-id"
        />
      ) : null}
    </div>
  );
}

function ProviderSelect({
  value,
  onChange,
}: {
  value: ModelProvider;
  onChange: (provider: ModelProvider) => void;
}) {
  return (
    <Select aria-label="Chat model provider" value={value} onChange={e => onChange(e.target.value as ModelProvider)}>
      {PROVIDER_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </Select>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text variant="body-sm" tone="muted" className="mb-1 block">
      {children}
    </Text>
  );
}

function EnabledToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Text variant="body-sm" as="span">
        Enabled
      </Text>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Enabled"
        onClick={() => onChange(!checked)}
        className={`
          relative inline-flex h-5 w-9 shrink-0 items-center rounded-full
          transition-colors duration-fast
          focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring-color)]
          ${checked ? 'bg-[var(--brand-accent)]' : 'bg-[var(--badge-muted-bg)]'}
        `}
      >
        <span
          aria-hidden
          className={`
            inline-block h-4 w-4 rounded-full bg-white shadow-[var(--shadow-sm)]
            transition-transform duration-fast
            ${checked ? 'translate-x-[18px]' : 'translate-x-[2px]'}
          `}
        />
      </button>
    </div>
  );
}

function TierPanel({
  title,
  hint,
  headerExtra,
  children,
}: {
  title: string;
  hint?: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Surface tone="panel" border="subtle" radius="card" padding="md">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <Text variant="body" weight="medium" as="p">
            {title}
          </Text>
          {hint ? (
            <Text variant="body-sm" tone="muted" as="p" className="mt-0.5">
              {hint}
            </Text>
          ) : null}
        </div>
        {headerExtra}
      </div>
      <Stack gap="sm">{children}</Stack>
    </Surface>
  );
}

function ApiKeyRow({
  provider,
  label,
  value,
  onChange,
  onTest,
  testDisabled,
  testPending,
  consoleUrl,
  consoleLabel,
}: {
  provider: ModelProvider;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onTest: () => void;
  testDisabled: boolean;
  testPending: boolean;
  consoleUrl?: string;
  consoleLabel: string;
}) {
  if (provider === 'ollama_local') {
    return (
      <div className="flex flex-col gap-2">
        <Text variant="body-sm" tone="muted" as="p">
          Connects to OLLAMA_API_BASE on the Core server (default:
          {' '}http://localhost:11434). No API key is stored. Choose a model
          installed on that Ollama server.
        </Text>
        <Button
          variant="secondary"
          size="sm"
          onClick={onTest}
          disabled={testPending}
        >
          {testPending ? 'Checking…' : 'Test local connection'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-wrap gap-2">
        <Input
          type="password"
          aria-label={label}
          autoComplete="off"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="sk-…"
          className="min-w-[12rem] flex-1"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={onTest}
          disabled={testDisabled || testPending}
        >
          Test connection
        </Button>
      </div>
      {consoleUrl ? (
        <a
          href={consoleUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex w-fit items-center gap-1 text-xs text-[var(--accent)] hover:underline"
        >
          {consoleLabel}
          <ExternalLink size={12} />
        </a>
      ) : null}
    </div>
  );
}

function speechSummary(cred: ModelCredential): string {
  if (!cred.speech_model) return 'Off';
  const prov =
    cred.speech_provider && cred.speech_provider !== cred.provider
      ? cred.speech_provider
      : cred.provider;
  return `${providerLabel(prov)} · ${cred.speech_model}`;
}

type SpeechSlotState = {
  enabled: boolean;
  provider: SpeechProvider;
  model: string;
  apiKey: string;
};

function freshSpeechSlot(): SpeechSlotState {
  const provider = SPEECH_CAPABLE_PROVIDERS[0];
  return {
    enabled: false,
    provider,
    model: defaultSpeechModel(provider),
    apiKey: '',
  };
}

/**
 * Voice input slot. It is opt-in (off by
 * default — members' dictation bills this key) and its provider list is
 * limited to vendors with a streaming speech-to-text API.
 */
function SpeechSlotEditor({
  baseProvider,
  state,
  onChange,
  onValidate,
  validatePending,
}: {
  baseProvider: ModelProvider;
  state: SpeechSlotState;
  onChange: (next: SpeechSlotState) => void;
  onValidate: () => void;
  validatePending: boolean;
}) {
  const label = MODEL_SLOT_LABELS.speech;
  const needsKey = state.enabled && state.provider !== baseProvider;

  return (
    <TierPanel
      title={label}
      hint={MODEL_SLOT_HINTS.speech}
      headerExtra={
        <EnabledToggle
          checked={state.enabled}
          onChange={enabled =>
            onChange({
              ...state,
              enabled,
              model: state.model || defaultSpeechModel(state.provider),
            })
          }
        />
      }
    >
      {state.enabled ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Provider</FieldLabel>
              <Select
                aria-label="Voice input provider"
                value={state.provider}
                onChange={e => {
                  const next = e.target.value as SpeechProvider;
                  onChange({
                    ...state,
                    provider: next,
                    model: defaultSpeechModel(next),
                    apiKey: '',
                  });
                }}
              >
                {SPEECH_CAPABLE_PROVIDERS.map(p => (
                  <option key={p} value={p}>
                    {providerLabel(p)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel>Model</FieldLabel>
              <PresetModelSelect
                label="Voice input model"
                presets={SPEECH_MODEL_PRESETS[state.provider]}
                value={state.model}
                onChange={model => onChange({ ...state, model })}
              />
            </div>
          </div>
          {needsKey ? (
            <ApiKeyRow
              provider={state.provider}
              label={`${label} API key`}
              value={state.apiKey}
              onChange={apiKey => onChange({ ...state, apiKey })}
              onTest={onValidate}
              testDisabled={!state.apiKey.trim()}
              testPending={validatePending}
              consoleUrl={PROVIDER_CONSOLE_URLS[state.provider]}
              consoleLabel={`${providerLabel(state.provider)} console`}
            />
          ) : (
            <Text variant="body-sm" tone="muted">
              Uses the same API key as your primary model.
            </Text>
          )}
        </>
      ) : (
        <Text variant="body-sm" tone="muted">
          Off — the chat mic uses your browser&apos;s built-in speech
          recognition where it&apos;s available.
        </Text>
      )}
    </TierPanel>
  );
}

export function ModelCredentialsSection() {
  const qc = useQueryClient();
  const toast = useToast();
  const { agentKeyMode } = useAgentiveCapability();

  const [provider, setProvider] = useState<ModelProvider>('ollama');
  const [model, setModel] = useState(() => defaultModel('ollama'));
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [withoutKey, setWithoutKey] = useState(false);
  const [speech, setSpeech] = useState<SpeechSlotState>(freshSpeechSlot);

  const credQuery = useQuery<ModelCredential | null>({
    queryKey: QUERY_KEY,
    queryFn: () => modelCredentialsApi.get(),
  });

  const active = credQuery.data ?? null;

  const activeSyncKey = active
    ? [
        active.updated_at,
        active.provider,
        active.model,
        active.base_url ?? '',
        active.speech_provider,
        active.speech_model,
      ].join('|')
    : '';

  useEffect(() => {
    if (!active) return;
    setProvider(active.provider);
    setModel(active.model);
    setBaseUrl(active.base_url ?? '');
    setWithoutKey(active.provider === 'custom_openai' && !active.key_fingerprint);
    const speechProvider: SpeechProvider = isSpeechProvider(active.speech_provider)
      ? active.speech_provider
      : isSpeechProvider(active.provider)
        ? active.provider
        : SPEECH_CAPABLE_PROVIDERS[0];
    setSpeech({
      enabled: !!active.speech_model,
      provider: speechProvider,
      model: active.speech_model || defaultSpeechModel(speechProvider),
      apiKey: '',
    });
  }, [activeSyncKey, active]);

  const handleProviderChange = (next: ModelProvider) => {
    setProvider(next);
    setModel(defaultModel(next));
    setApiKey('');
    setWithoutKey(false);
    if (next !== 'custom_openai') setBaseUrl('');
  };

  const applyRecommendedOllama = () => handleProviderChange('ollama');

  const saveMut = useMutation({
    mutationFn: () => {
      const speechModel = speech.enabled ? speech.model.trim() : '';
      const speechSeparate = !!speechModel && speech.provider !== provider;
      const trimmedKey = apiKey.trim();
      const trimmedBase = baseUrl.trim();
      return modelCredentialsApi.upsert({
        provider,
        model: model.trim(),
        ...(trimmedKey ? { api_key: trimmedKey } : {}),
        ...(provider === 'custom_openai' && withoutKey ? { clear_api_key: true } : {}),
        ...(provider === 'custom_openai' && trimmedBase
          ? { base_url: trimmedBase }
          : {}),
        // Keep the stored custom endpoint when updating model/key without
        // retyping the URL: omit means "keep", explicit value replaces.
        ...(provider === 'custom_openai' && !trimmedBase && active?.base_url
          ? { base_url: active.base_url }
          : {}),
        speech_model: speechModel,
        speech_provider: speechSeparate ? speech.provider : undefined,
        speech_api_key:
          speechSeparate && speech.apiKey.trim() ? speech.apiKey.trim() : undefined,
      });
    },
    onSuccess: cred => {
      setApiKey('');
      setSpeech(prev => ({ ...prev, apiKey: '' }));
      qc.setQueryData(QUERY_KEY, cred);
      qc.invalidateQueries({ queryKey: ['agentive', 'status'] });
      toast.showToast('Models and keys saved', 'success');
    },
    onError: (err: Error) => {
      toast.showToast(errorMessageFromAxios(err, 'Failed to save credentials'), 'error');
    },
  });

  const validateKey = useMutation({
    mutationFn: ({
      prov,
      key,
      base,
    }: {
      prov: ModelProvider;
      key: string;
      base?: string;
    }) =>
      modelCredentialsApi.validate({
        provider: prov,
        api_key: key,
        ...(prov === 'custom_openai' && base ? { base_url: base } : {}),
      }),
    onSuccess: (result, vars) => {
      toast.showToast(
        result.valid
          ? vars.prov === 'ollama_local'
            ? 'Local Ollama connection validated'
            : `${providerLabel(vars.prov)} key validated`
          : result.message || 'Invalid API key',
        result.valid ? 'success' : 'error',
      );
    },
    onError: (err: Error) => {
      toast.showToast(errorMessageFromAxios(err, 'Validation failed'), 'error');
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => modelCredentialsApi.revoke(),
    onSuccess: () => {
      qc.setQueryData(QUERY_KEY, null);
      qc.invalidateQueries({ queryKey: ['agentive', 'status'] });
      toast.showToast('Models and keys removed', 'success');
    },
    onError: (err: Error) => {
      toast.showToast(errorMessageFromAxios(err, 'Failed to remove credentials'), 'error');
    },
  });

  const speechSlotValid =
    !speech.enabled ||
    (!!speech.model.trim() &&
      (speech.provider === provider || !!speech.apiKey.trim()));

  const customBaseValid =
    provider !== 'custom_openai' ||
    !!(baseUrl.trim() || active?.base_url);

  const canRetainKey = active?.provider === provider &&
    (provider !== 'custom_openai' ||
      (baseUrl.trim() || active.base_url || '').replace(/\/+$/, '') === active.base_url);
  const customKeyValid = provider !== 'custom_openai' ||
    withoutKey || !!apiKey.trim() || (canRetainKey && !!active?.key_fingerprint);

  const canSave =
    (active ||
      apiKey.trim() ||
      provider === 'ollama_local' ||
      provider === 'custom_openai') &&
    model.trim() &&
    customBaseValid &&
    customKeyValid &&
    speechSlotValid;

  return (
    <SettingsSection
      title="Your models & keys"
      description="Choose your primary chat model and optional voice input. Local Ollama can run without a hosted API key."
    >
      <Stack gap="md">
        <Text variant="body-sm" tone="muted">
          Key policy:{' '}
          <Text as="span" weight="medium">
            {AGENT_KEY_MODE_LABELS[agentKeyMode] ?? agentKeyMode}
          </Text>
        </Text>

        {credQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : credQuery.isError ? (
          <Text variant="body" tone="danger" as="p">
            Failed to load model credentials:{' '}
            {credQuery.error instanceof Error
              ? credQuery.error.message
              : 'Unknown error'}
          </Text>
        ) : (
          <>
            {active ? (
              <Surface tone="panel-2" border="subtle" radius="card" padding="md">
                <Stack gap="sm">
                  <StatusPill state="ok">Active</StatusPill>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Surface tone="panel" border="subtle" radius="card" padding="none" className="px-3 py-2">
                      <Text variant="body-sm" tone="muted" as="p">Primary</Text>
                      <Text variant="body" weight="medium" as="p" className="mt-0.5">
                        {providerLabel(active.provider)} · {active.model}
                      </Text>
                    </Surface>
                    <Surface
                      tone="panel"
                      border="subtle"
                      radius="card"
                      padding="none"
                      className="px-3 py-2"
                    >
                      <Text variant="body-sm" tone="muted" as="p">
                        {MODEL_SLOT_LABELS.speech}
                      </Text>
                      <Text variant="body" weight="medium" as="p" className="mt-0.5">
                        {speechSummary(active)}
                      </Text>
                    </Surface>
                  </div>
                  <Text variant="body-sm" tone="muted">
                    {active.provider === 'custom_openai'
                      ? `Custom endpoint ${active.base_url ?? ''} · ${
                          active.key_fingerprint
                            ? `key ${active.key_fingerprint}`
                            : 'no API key stored'
                        }${
                          active.validated_at
                            ? ` · validated ${new Date(active.validated_at).toLocaleString()}`
                            : ''
                        }`
                      : active.provider === 'ollama_local' ||
                          !active.key_fingerprint
                        ? `${providerLabel(active.provider)} · no API key stored`
                        : `Primary key ${active.key_fingerprint}${
                            active.validated_at
                              ? ` · validated ${new Date(active.validated_at).toLocaleString()}`
                              : ''
                          }`}
                  </Text>
                  <Button
                    variant="danger"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={() => deleteMut.mutate()}
                    disabled={deleteMut.isPending}
                  >
                    Remove keys
                  </Button>
                </Stack>
              </Surface>
            ) : (
                <Text variant="body-sm" tone="muted">
                No keys saved yet. Your workspace may use shared models until you
                add your own.
              </Text>
            )}

            <Surface tone="panel-2" border="subtle" radius="card" padding="md">
              <Stack gap="md">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Text variant="body" weight="medium">
                    {active ? 'Update models & keys' : 'Add models & keys'}
                  </Text>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<Sparkles size={14} />}
                    onClick={applyRecommendedOllama}
                  >
                    Use recommended Ollama Cloud setup
                  </Button>
                </div>

                <TierPanel
                  title={MODEL_SLOT_LABELS.default}
                  hint={MODEL_SLOT_HINTS.default}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <FieldLabel>Provider</FieldLabel>
                      <ProviderSelect value={provider} onChange={handleProviderChange} />
                    </div>
                    <div>
                      <FieldLabel>Model</FieldLabel>
                      <ModelSelect
                        provider={provider}
                        value={model}
                        onChange={setModel}
                      />
                    </div>
                  </div>
                  {provider === 'custom_openai' ? (
                    <div className="flex flex-col gap-1">
                      <FieldLabel>Base URL</FieldLabel>
                      <Input
                        aria-label="Custom endpoint base URL"
                        autoComplete="off"
                        value={baseUrl}
                        onChange={e => setBaseUrl(e.target.value)}
                        placeholder="https://llm.example.com/v1"
                        className="min-w-[12rem] flex-1"
                      />
                      <Text variant="body-sm" tone="muted" as="p">
                        HTTPS OpenAI-compatible base URL up to /v1. Validated live via
                        GET /models before saving. Private hosts require operator approval.
                        Changing the endpoint requires a new key or an explicit keyless choice.
                        {active?.base_url && !baseUrl.trim()
                          ? ` Leave blank to keep ${active.base_url}.`
                          : ''}
                      </Text>
                    </div>
                  ) : null}
                  <ApiKeyRow
                    provider={provider}
                    label={
                      provider === 'custom_openai'
                        ? canRetainKey && active?.key_fingerprint
                          ? 'API key (leave blank to keep current)'
                          : 'API key for this endpoint'
                        : active
                          ? 'API key (leave blank to keep current)'
                          : 'API key'
                    }
                    value={apiKey}
                    onChange={value => { setApiKey(value); if (value.trim()) setWithoutKey(false); }}
                    onTest={() =>
                      validateKey.mutate({
                        prov: provider,
                        key: apiKey.trim(),
                        base:
                          provider === 'custom_openai'
                            ? baseUrl.trim() || active?.base_url || ''
                            : undefined,
                      })
                    }
                    testDisabled={
                      provider === 'ollama_local'
                        ? false
                        : provider === 'custom_openai'
                          ? !(baseUrl.trim() || active?.base_url) || (!withoutKey && !apiKey.trim())
                          : !apiKey.trim()
                    }
                    testPending={validateKey.isPending}
                    consoleUrl={PROVIDER_CONSOLE_URLS[provider]}
                    consoleLabel={`${providerLabel(provider)} console`}
                  />
                  {provider === 'custom_openai' ? (
                    <Text as="label" variant="body-sm" className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={withoutKey}
                        onChange={event => {
                          setWithoutKey(event.target.checked);
                          if (event.target.checked) setApiKey('');
                        }}
                      />
                      Use without an API key (removes any saved primary key)
                    </Text>
                  ) : null}
                </TierPanel>

                <SpeechSlotEditor
                  baseProvider={provider}
                  state={speech}
                  onChange={setSpeech}
                  onValidate={() =>
                    validateKey.mutate({
                      prov: speech.provider,
                      key: speech.apiKey.trim(),
                    })
                  }
                  validatePending={validateKey.isPending}
                />

                <div className="flex justify-end border-t border-[var(--border-subtle)] pt-3">
                  <Button
                    size="sm"
                    onClick={() => saveMut.mutate()}
                    disabled={!canSave || saveMut.isPending}
                  >
                    Save
                  </Button>
                </div>
              </Stack>
            </Surface>
          </>
        )}
      </Stack>
    </SettingsSection>
  );
}
