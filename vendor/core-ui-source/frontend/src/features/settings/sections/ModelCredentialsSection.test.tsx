import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { modelCredentialsApi } from '../../../api/modelCredentials';
import { ModelCredentialsSection } from './ModelCredentialsSection';

vi.mock('../../../api/modelCredentials', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/modelCredentials')>(),
  modelCredentialsApi: { get: vi.fn(), upsert: vi.fn(), validate: vi.fn(), revoke: vi.fn() },
}));
vi.mock('../hooks/useAgentiveCapability', () => ({
  useAgentiveCapability: () => ({ agentKeyMode: 'hybrid' }),
}));
const showToast = vi.hoisted(() => vi.fn());
vi.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ showToast }),
}));

function showSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ModelCredentialsSection /></QueryClientProvider>);
}

describe('native model credentials', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(modelCredentialsApi.get).mockResolvedValue(null); });

  it('shows the primary model and voice input without retired gear controls', async () => {
    showSettings();
    await screen.findByRole('button', { name: 'Save' });
    expect(screen.getByText('Primary')).toBeInTheDocument();
    expect(screen.getByText('Voice input')).toBeInTheDocument();
    for (const label of ['Quick replies', 'Complex tasks', 'Images']) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(screen.getByRole('option', { name: /DeepSeek V4.1 Flash/ })).toHaveValue('deepseek-v4.1-flash');
  });

  it('saves only the selected native model and voice configuration', async () => {
    vi.mocked(modelCredentialsApi.upsert).mockResolvedValue({
      provider: 'ollama', model: 'deepseek-v4.1-flash', key_fingerprint: 'test', is_active: true,
    });
    showSettings();
    await screen.findByRole('button', { name: 'Save' });
    const key = document.querySelector('input[type="password"]');
    expect(key).not.toBeNull();
    fireEvent.change(key!, { target: { value: 'test-cloud-api-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(modelCredentialsApi.upsert).toHaveBeenCalledOnce());
    const body = vi.mocked(modelCredentialsApi.upsert).mock.calls[0][0];
    expect(body).toMatchObject({ provider: 'ollama', model: 'deepseek-v4.1-flash', api_key: 'test-cloud-api-key', speech_model: '' });
    expect(Object.keys(body).some(key => /^(light|heavy|vision)_/.test(key))).toBe(false);
  });
});

describe('custom endpoint credential boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(modelCredentialsApi.get).mockResolvedValue({
      provider: 'custom_openai', model: 'my-model', base_url: 'https://first.example/v1',
      key_fingerprint: 'saved-key', is_active: true,
    });
  });

  it('requires a new key or an explicit keyless choice after changing endpoint', async () => {
    showSettings();
    const base = await screen.findByLabelText('Custom endpoint base URL');
    fireEvent.change(base, { target: { value: 'https://second.example/v1' } });
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Use without an API key/ }));
    expect(save).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(modelCredentialsApi.upsert).toHaveBeenCalledOnce());
    expect(vi.mocked(modelCredentialsApi.upsert).mock.calls[0][0]).toMatchObject({
      provider: 'custom_openai', base_url: 'https://second.example/v1', clear_api_key: true,
    });
    expect(vi.mocked(modelCredentialsApi.upsert).mock.calls[0][0]).not.toHaveProperty('api_key');
  });

  it('retains the existing key only when the endpoint is unchanged', async () => {
    showSettings();
    await screen.findByLabelText('Custom endpoint base URL');
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(modelCredentialsApi.upsert).toHaveBeenCalledOnce());
    const body = vi.mocked(modelCredentialsApi.upsert).mock.calls[0][0];
    expect(body).not.toHaveProperty('api_key');
    expect(body).not.toHaveProperty('clear_api_key');
    expect(body.base_url).toBe('https://first.example/v1');
  });

  it('clears an unsaved key when switching providers', async () => {
    showSettings();
    await screen.findByLabelText('Custom endpoint base URL');
    const key = document.querySelector('input[type="password"]')!;
    fireEvent.change(key, { target: { value: 'synthetic-unsaved-key' } });
    fireEvent.change(screen.getByLabelText('Chat model provider'), { target: { value: 'openai' } });
    expect(document.querySelector('input[type="password"]')).toHaveValue('');
  });
});


it('explains a provider rejection instead of showing only HTTP 400', async () => {
  vi.mocked(modelCredentialsApi.get).mockResolvedValue(null);
  vi.mocked(modelCredentialsApi.upsert).mockRejectedValue({ message: 'Request failed with status code 400', response: { data: { message: 'invalid API key' } } });
  showSettings();
  await screen.findByRole('button', { name: 'Save' });
  fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'synthetic-invalid-key' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('invalid API key', 'error'));
});
