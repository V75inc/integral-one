/**
 * Voice input slot on the AI Models settings panel.
 *
 * The slot is opt-in (members' dictation bills the owner's key), limited to
 * speech-capable providers, and reuses the primary key only when the
 * provider matches.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  cleanup,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../../../api/modelCredentials', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../../../api/modelCredentials')>();
  return {
    ...actual,
    modelCredentialsApi: {
      get: vi.fn(),
      upsert: vi.fn(),
      revoke: vi.fn(),
      validate: vi.fn(),
    },
  };
});
vi.mock('../../hooks/useAgentiveCapability', () => ({
  useAgentiveCapability: () => ({ agentKeyMode: 'hybrid' }),
}));
vi.mock('../../../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import {
  modelCredentialsApi,
  type ModelCredential,
} from '../../../../api/modelCredentials';
import { ModelCredentialsSection } from '../ModelCredentialsSection';

const api = modelCredentialsApi as unknown as {
  get: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  validate: ReturnType<typeof vi.fn>;
};

function cred(overrides: Partial<ModelCredential> = {}): ModelCredential {
  return {
    provider: 'openai',
    model: 'gpt-4.1',
    key_fingerprint: 'abc123...1234',
    is_active: true,
    ...overrides,
  };
}

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ModelCredentialsSection />
    </QueryClientProvider>,
  );
}

/** The Voice input editor panel (not the summary tile). */
async function voicePanel() {
  const titles = await screen.findAllByText('Voice input');
  const title = titles.find(el =>
    el.closest('div')?.parentElement?.querySelector('[role="switch"]'),
  );
  if (!title) throw new Error('Voice input editor not rendered');
  return title.closest('div')!.parentElement!.parentElement as HTMLElement;
}

describe('ModelCredentialsSection — voice input slot', () => {
  beforeEach(() => {
    api.upsert.mockImplementation(async body => cred(body));
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows voice input as off by default', async () => {
    api.get.mockResolvedValue(cred());
    renderSection();

    const panel = await voicePanel();
    expect(within(panel).getByRole('switch', { name: 'Enabled' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(within(panel).getByText(/browser.s built-in speech recognition/)).toBeInTheDocument();
  });

  it('enabling on an OpenAI primary reuses the primary key', async () => {
    api.get.mockResolvedValue(cred());
    renderSection();

    const panel = await voicePanel();
    fireEvent.click(within(panel).getByRole('switch', { name: 'Enabled' }));
    expect(
      within(panel).getByText('Uses the same API key as your primary model.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.upsert).toHaveBeenCalledTimes(1));
    const body = api.upsert.mock.calls[0][0];
    expect(body.speech_model).toBe('gpt-live-transcribe');
    expect(body.speech_provider).toBeUndefined();
    expect(body.speech_api_key).toBeUndefined();
  });

  it('a non-OpenAI primary needs its own voice input key before saving', async () => {
    api.get.mockResolvedValue(
      cred({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' }),
    );
    renderSection();

    const panel = await voicePanel();
    fireEvent.click(within(panel).getByRole('switch', { name: 'Enabled' }));

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();

    fireEvent.change(within(panel).getByPlaceholderText('sk-…'), {
      target: { value: 'sk-openai-speech-5678' },
    });
    expect(save).not.toBeDisabled();
    fireEvent.click(save);

    await waitFor(() => expect(api.upsert).toHaveBeenCalledTimes(1));
    const body = api.upsert.mock.calls[0][0];
    expect(body.speech_provider).toBe('openai');
    expect(body.speech_api_key).toBe('sk-openai-speech-5678');
  });

  it('turning voice input off sends an empty model', async () => {
    api.get.mockResolvedValue(cred({ speech_model: 'gpt-live-transcribe' }));
    renderSection();

    const panel = await voicePanel();
    const toggle = within(panel).getByRole('switch', { name: 'Enabled' });
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(api.upsert).toHaveBeenCalledTimes(1));
    expect(api.upsert.mock.calls[0][0].speech_model).toBe('');
  });
});

describe('ModelCredentialsSection — local Ollama', () => {
  beforeEach(() => {
    api.upsert.mockImplementation(async body => cred(body));
    api.validate.mockResolvedValue({ valid: true, message: 'local Ollama reachable' });
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('tests and saves a local model without collecting an API key', async () => {
    api.get.mockResolvedValue(null);
    renderSection();

    const [providerSelect] = await screen.findAllByRole('combobox');
    fireEvent.change(providerSelect, { target: { value: 'ollama_local' } });

    expect(
      screen.getByText(/No API key is stored/),
    ).toBeInTheDocument();
    const testConnection = screen.getByRole('button', {
      name: 'Test local connection',
    });
    expect(testConnection).toBeEnabled();
    fireEvent.click(testConnection);
    await waitFor(() =>
      expect(api.validate).toHaveBeenCalledWith({
        provider: 'ollama_local',
        api_key: '',
      }),
    );

    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.upsert).toHaveBeenCalledTimes(1));
    const body = api.upsert.mock.calls[0][0];
    expect(body.provider).toBe('ollama_local');
    expect(body.model).toBe('gemma4:e2b');
    expect(body.api_key).toBeUndefined();
  });
});
