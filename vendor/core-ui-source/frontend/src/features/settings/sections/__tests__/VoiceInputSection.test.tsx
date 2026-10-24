/**
 * Settings → Voice input: provider status variants, preference writes,
 * browser privacy note, and the local microphone test.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../api/speech', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../../api/speech')>()),
  useSpeechPreferences: vi.fn(),
  useSpeechConfig: vi.fn(),
  useUpdateSpeechPreferences: vi.fn(),
}));
vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import {
  useSpeechConfig,
  useSpeechPreferences,
  useUpdateSpeechPreferences,
  type SpeechConfig,
  type SpeechPreferences,
} from '../../../../api/speech';
import { resetSttEngines } from '../../../speech/engines/registry';
import { VoiceInputSection } from '../VoiceInputSection';

const mockedPrefs = useSpeechPreferences as unknown as ReturnType<typeof vi.fn>;
const mockedConfig = useSpeechConfig as unknown as ReturnType<typeof vi.fn>;
const mockedUpdate = useUpdateSpeechPreferences as unknown as ReturnType<typeof vi.fn>;

const PREFS: SpeechPreferences = {
  enabled: true,
  engine: 'auto',
  language: 'auto',
  hotkey: 'Mod+Shift+Space',
  hotkey_mode: 'hold_or_toggle',
  auto_send_on_stop: false,
  silence_timeout_seconds: 8,
};

const BROWSER_OPTION = {
  engine: 'webspeech',
  source: 'browser' as const,
  display_name: 'Browser speech recognition',
  streaming: true,
  privacy_note: 'Browser recognition can send your audio to the browser maker.',
};

function config(overrides: Partial<SpeechConfig> = {}): SpeechConfig {
  return {
    workspace_id: 'ws-1',
    workspace_role: 'member',
    preferences: PREFS,
    engines: [BROWSER_OPTION],
    preferred_engine: 'webspeech',
    provider: {
      configured: false,
      available_to_you: false,
      provider: null,
      model: null,
      source: null,
    },
    limits: { max_session_seconds: 300, session_ttl_seconds: 60 },
    ...overrides,
  };
}

const PROVIDER_CONFIG = config({
  engines: [
    {
      engine: 'openai-realtime',
      source: 'workspace',
      display_name: 'OpenAI',
      streaming: true,
      privacy_note: null,
    },
    BROWSER_OPTION,
  ],
  preferred_engine: 'openai-realtime',
  provider: {
    configured: true,
    available_to_you: true,
    provider: 'openai',
    model: 'gpt-live-transcribe',
    source: 'byok',
  },
});

let mutate: ReturnType<typeof vi.fn>;

function renderSection(cfg: SpeechConfig, navigateToSection = vi.fn()) {
  mockedConfig.mockReturnValue({ data: cfg, isLoading: false });
  render(<VoiceInputSection navigateToSection={navigateToSection} />);
  return navigateToSection;
}

describe('VoiceInputSection', () => {
  beforeEach(() => {
    resetSttEngines();
    vi.stubGlobal('webkitSpeechRecognition', class {});
    vi.stubGlobal('RTCPeerConnection', class {});
    mutate = vi.fn();
    mockedPrefs.mockReturnValue({ data: PREFS, isLoading: false });
    mockedUpdate.mockReturnValue({ mutate, isPending: false });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('shows a retry when preferences fail before any data arrives', () => {
    const refetch = vi.fn();
    mockedPrefs.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch });
    renderSection(config());
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load voice preferences');
    fireEvent.click(screen.getByRole('button', { name: 'Retry voice preferences' }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('prevents overlapping preference updates', () => {
    mockedUpdate.mockReturnValue({ mutate, isPending: true });
    renderSection(config());
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeDisabled();
  });

  it('offers owners a path to set up a provider', () => {
    const navigate = renderSection(config({ workspace_role: 'owner' }));
    expect(screen.getByText('Not set up')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Set up in AI Models' }));
    expect(navigate).toHaveBeenCalledWith('ai-models');
  });

  it('does not offer set-up to members', () => {
    renderSection(config());
    expect(screen.queryByRole('button', { name: 'Set up in AI Models' })).toBeNull();
  });

  it('shows the configured provider and whose key it uses', () => {
    renderSection(PROVIDER_CONFIG);
    expect(screen.getByText('OpenAI · gpt-live-transcribe')).toBeInTheDocument();
    expect(screen.getByText("Uses the workspace owner's key.")).toBeInTheDocument();
    expect(screen.getByText('This browser dictates with OpenAI.')).toBeInTheDocument();
  });

  it('tells guests the provider is for members', () => {
    renderSection(
      config({
        workspace_role: 'guest',
        provider: { ...PROVIDER_CONFIG.provider, available_to_you: false },
      }),
    );
    expect(screen.getByText('Members only')).toBeInTheDocument();
  });

  it('shows the browser privacy note when the browser recognizer is in use', () => {
    renderSection(config());
    expect(screen.getByText(BROWSER_OPTION.privacy_note)).toBeInTheDocument();
  });

  it('hides the privacy note when the workspace provider is in use', () => {
    renderSection(PROVIDER_CONFIG);
    expect(screen.queryByText(BROWSER_OPTION.privacy_note)).toBeNull();
  });

  it('saves preference changes', () => {
    renderSection(config());
    fireEvent.click(screen.getByRole('button', { name: /Send when I stop talking/ }));
    expect(mutate).toHaveBeenCalledWith({ auto_send_on_stop: true }, expect.anything());

    fireEvent.change(screen.getByLabelText('Recognizer'), { target: { value: 'browser' } });
    expect(mutate).toHaveBeenCalledWith({ engine: 'browser' }, expect.anything());

    fireEvent.change(screen.getByLabelText('Stop after silence'), { target: { value: '0' } });
    expect(mutate).toHaveBeenCalledWith({ silence_timeout_seconds: 0 }, expect.anything());
  });

  it('reports a blocked microphone in the mic test', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => {
          throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' });
        }),
      },
      configurable: true,
    });
    renderSection(config());
    fireEvent.click(screen.getByRole('button', { name: 'Test microphone' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Microphone access is blocked'),
    );
  });
  it('keeps model management available for an already configured owner', () => {
    const navigate = renderSection({ ...PROVIDER_CONFIG, workspace_role: 'owner' });
    fireEvent.click(screen.getByRole('button', { name: 'Manage model in AI Models' }));
    expect(navigate).toHaveBeenCalledWith('ai-models');
  });
});
