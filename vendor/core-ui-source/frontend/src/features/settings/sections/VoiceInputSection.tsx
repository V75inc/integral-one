/**
 * Settings → Voice input.
 *
 * Personal dictation preferences, a local microphone test, and the status of
 * the workspace's speech-to-text provider. The provider itself is configured
 * by the workspace owner under AI Models (the model credential's voice-input
 * slot), so this panel links there rather than duplicating it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { PROVIDER_LABELS, type ModelProvider } from '../../../api/modelCredentials';
import {
  useSpeechConfig,
  useSpeechPreferences,
  useUpdateSpeechPreferences,
  type HotkeyMode,
  type SpeechConfig,
  type SpeechEngineChoice,
  type SpeechPreferences,
} from '../../../api/speech';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useToast } from '../../../context/ToastContext';
import { LevelMeter, Select, Stack, Surface, Text } from '../../../ui';
import { startLevelMeter } from '../../speech/audio/levelMeter';
import { resolveEngine } from '../../speech/resolveEngine';
import { mapMediaError } from '../../speech/useDictation';
import { SettingsSection, StatusPill, ToggleRow } from '../components/Field';
import { HotkeyInput } from '../components/HotkeyInput';

export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'it-IT', label: 'Italian' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'nl-NL', label: 'Dutch' },
  { value: 'hi-IN', label: 'Hindi' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
];

const SILENCE_OPTIONS = [0, 5, 8, 15, 30];

const ENGINE_LABELS: Record<SpeechEngineChoice, string> = {
  auto: 'Workspace provider when available',
  browser: 'Browser recognition only',
};

const MODE_LABELS: Record<HotkeyMode, string> = {
  hold_or_toggle: 'Tap to toggle, hold to talk',
  toggle: 'Tap to start and stop',
  hold: 'Hold to talk',
};

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { message?: string } } })?.response?.data;
  return data?.message || (err instanceof Error ? err.message : '') || "Couldn't save";
}

function providerName(provider: string | null): string {
  if (!provider) return 'Provider';
  return PROVIDER_LABELS[provider as ModelProvider] ?? provider;
}

function LabeledField({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block">
        <Text as="span" variant="body-sm" tone="muted">
          {label}
        </Text>
      </label>
      {children}
    </div>
  );
}

function ProviderStatus({ config, onSetUp }: { config: SpeechConfig; onSetUp?: () => void }) {
  const { provider } = config;
  const resolved = resolveEngine(config);
  const isOwner = config.workspace_role === 'owner';

  let pill: ReactNode;
  let detail: string;
  if (provider.configured && provider.available_to_you) {
    pill = (
      <StatusPill state="ok">
        {providerName(provider.provider)} · {provider.model}
      </StatusPill>
    );
    detail =
      provider.source === 'platform'
        ? "Uses this deployment's shared key."
        : "Uses the workspace owner's key.";
  } else if (provider.configured) {
    pill = <StatusPill state="warn">Members only</StatusPill>;
    detail =
      "This workspace's speech-to-text provider is for its members, so you'll dictate with your browser's recognizer.";
  } else {
    pill = <StatusPill state="idle">Not set up</StatusPill>;
    detail = isOwner
      ? "Add a voice-input model under AI Models to dictate through a provider. Until then your browser's recognizer is used where it's available."
      : "The workspace owner hasn't set up a speech-to-text provider. Your browser's recognizer is used where it's available.";
  }

  const thisBrowser = !resolved
    ? "Voice input isn't available in this browser."
    : resolved.source === 'workspace'
      ? `This browser dictates with ${providerName(provider.provider)}.`
      : 'This browser dictates with its built-in speech recognition.';

  return (
    <Surface tone="panel-2" border="subtle" radius="card" padding="md">
      <Stack gap="sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text variant="body" weight="medium" as="p">
            Transcription model
          </Text>
          {pill}
        </div>
        <Text variant="body-sm" tone="muted" as="p">
          {detail}
        </Text>
        <Text variant="body-sm" as="p">
          {thisBrowser}
        </Text>
        {isOwner && onSetUp ? (
          <div>
            <Button variant="secondary" size="sm" onClick={onSetUp}>
              {provider.configured ? 'Manage model in AI Models' : 'Set up in AI Models'}
            </Button>
          </div>
        ) : null}
      </Stack>
    </Surface>
  );
}

function MicTest() {
  const [level, setLevel] = useState(0);
  const [device, setDevice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't capture audio.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const meter = startLevelMeter(stream, setLevel);
      setDevice(stream.getAudioTracks()[0]?.label || 'Default microphone');
      setTesting(true);
      stopRef.current = () => {
        meter.stop();
        for (const track of stream.getTracks()) track.stop();
        setLevel(0);
        setTesting(false);
        stopRef.current = null;
      };
    } catch (err) {
      setError(mapMediaError(err).message);
    }
  };

  return (
    <Surface tone="panel-2" border="subtle" radius="card" padding="md">
      <Stack gap="sm">
        <Text variant="body" weight="medium" as="p">
          Microphone test
        </Text>
        <Text variant="body-sm" tone="muted" as="p">
          Checks that your browser can hear you. Nothing is recorded or sent anywhere.
        </Text>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => (testing ? stopRef.current?.() : void start())}
          >
            {testing ? 'Stop test' : 'Test microphone'}
          </Button>
          {testing ? (
            <>
              <LevelMeter level={level} bars={5} />
              <Text variant="body-sm" tone="muted" as="span">
                {device}
              </Text>
            </>
          ) : null}
        </div>
        {error ? (
          <div role="alert">
            <Text variant="body-sm" tone="danger" as="p">
              {error}
            </Text>
          </div>
        ) : null}
      </Stack>
    </Surface>
  );
}

export function VoiceInputSection({
  navigateToSection,
}: {
  navigateToSection?: (id: string) => void;
}) {
  const prefsQuery = useSpeechPreferences();
  const configQuery = useSpeechConfig();
  const update = useUpdateSpeechPreferences();
  const { showToast } = useToast();

  const prefs = prefsQuery.data;
  const config = configQuery.data;
  const save = (patch: Partial<SpeechPreferences>) =>
    update.mutate(patch, {
      onSuccess: () => showToast('Voice input preferences saved.', 'success'),
      onError: err => showToast(errorMessage(err), 'error'),
    });

  const browserNote = config?.engines.find(e => e.source === 'browser')?.privacy_note;
  const resolved = resolveEngine(config);
  const showPrivacyNote =
    !!browserNote && (prefs?.engine === 'browser' || resolved?.source === 'browser');
  const languageOptions =
    prefs && !LANGUAGE_OPTIONS.some(o => o.value === prefs.language)
      ? [...LANGUAGE_OPTIONS, { value: prefs.language, label: prefs.language }]
      : LANGUAGE_OPTIONS;

  return (
    <SettingsSection
      title="Voice input"
      description="Dictate into the agent chat with the mic button or a keyboard shortcut. What you say lands in the message box for you to review before sending."
    >
      <Stack gap="md">
        {config ? (
          <ProviderStatus
            config={config}
            onSetUp={navigateToSection ? () => navigateToSection('ai-models') : undefined}
          />
        ) : configQuery.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : configQuery.isError ? (
          <div role="alert"><Text as="p" variant="body-sm" tone="danger">Could not load the workspace voice provider.</Text><Button variant="secondary" size="sm" onClick={() => void configQuery.refetch()}>Retry provider status</Button></div>
        ) : null}

        {prefsQuery.isError ? (
          <div role="alert"><Text as="p" variant="body-sm" tone="danger">Could not load voice preferences.</Text><Button variant="secondary" size="sm" onClick={() => void prefsQuery.refetch()}>Retry voice preferences</Button></div>
        ) : !prefs ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <fieldset disabled={update.isPending} className="flex min-w-0 flex-col gap-3">
            <ToggleRow
              checked={prefs.enabled}
              onChange={enabled => save({ enabled })}
              label="Show the mic in the chat box"
              hint="Turn off to hide voice input entirely."
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <LabeledField id="voice-engine" label="Recognizer">
                <Select
                  id="voice-engine"
                  value={prefs.engine}
                  onChange={e => save({ engine: e.target.value as SpeechEngineChoice })}
                >
                  {(Object.keys(ENGINE_LABELS) as SpeechEngineChoice[]).map(value => (
                    <option key={value} value={value}>
                      {ENGINE_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </LabeledField>
              <LabeledField id="voice-language" label="Language">
                <Select
                  id="voice-language"
                  value={prefs.language}
                  onChange={e => save({ language: e.target.value })}
                >
                  {languageOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </LabeledField>
              <LabeledField id="voice-hotkey" label="Shortcut">
                <HotkeyInput
                  id="voice-hotkey"
                  value={prefs.hotkey}
                  onChange={hotkey => save({ hotkey })}
                />
              </LabeledField>
              <LabeledField id="voice-mode" label="Shortcut behavior">
                <Select
                  id="voice-mode"
                  value={prefs.hotkey_mode}
                  onChange={e => save({ hotkey_mode: e.target.value as HotkeyMode })}
                >
                  {(Object.keys(MODE_LABELS) as HotkeyMode[]).map(value => (
                    <option key={value} value={value}>
                      {MODE_LABELS[value]}
                    </option>
                  ))}
                </Select>
              </LabeledField>
              <LabeledField id="voice-silence" label="Stop after silence">
                <Select
                  id="voice-silence"
                  value={String(prefs.silence_timeout_seconds)}
                  onChange={e => save({ silence_timeout_seconds: Number(e.target.value) })}
                >
                  {SILENCE_OPTIONS.map(seconds => (
                    <option key={seconds} value={seconds}>
                      {seconds === 0 ? 'Never' : `${seconds} seconds`}
                    </option>
                  ))}
                </Select>
              </LabeledField>
            </div>
            <ToggleRow
              checked={prefs.auto_send_on_stop}
              onChange={autoSend => save({ auto_send_on_stop: autoSend })}
              label="Send when I stop talking"
              hint="Off by default so you can review first. Never sends while the agent is still answering."
            />
            {showPrivacyNote ? (
              <Text variant="body-sm" tone="muted" as="p">
                {browserNote}
              </Text>
            ) : null}
          </fieldset>
        )}

        <MicTest />
      </Stack>
    </SettingsSection>
  );
}
