import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailSection } from './EmailSection';

const mocks = vi.hoisted(() => ({ scope: { activeWorkspace: { id: 'workspace-a', name: 'Example workspace', your_role: 'owner' } }, get: vi.fn(), save: vi.fn(), test: vi.fn(), activate: vi.fn(), disable: vi.fn(), history: vi.fn() }));
vi.mock('../../../context/ScopeContext', () => ({ useScopeOptional: () => mocks.scope }));
vi.mock('../../../api/workspaceEmail', () => ({ workspaceEmailApi: mocks }));
const draft = { provider: 'resend', from_email: 'sender@example.com', from_name: 'Example', reply_to: '', smtp_host: '', smtp_port: 587, smtp_username: '', smtp_tls: 'starttls', api_key_configured: true, webhook_key_configured: false, tracking_available: true, tracking_configured: false, webhook_url: null };
const settings = { workspace_id: 'workspace-a', revision: 1, tested_revision: null, mode: 'platform', active: null, draft };
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { ...render(<QueryClientProvider client={client}><EmailSection /></QueryClientProvider>), client };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.scope.activeWorkspace = { id: 'workspace-a', name: 'Example workspace', your_role: 'owner' };
  mocks.get.mockResolvedValue(settings);
  mocks.history.mockResolvedValue({ items: [], next_cursor: null });
});
describe('workspace email settings', () => {
  it('requires workspace administrator authority', () => {
    mocks.scope.activeWorkspace.your_role = 'member';
    mount();
    expect(screen.getByText(/Only workspace owners and admins/)).toBeVisible();
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it('requires saving and testing the exact revision before activation', async () => {
    mount();
    await screen.findByLabelText('Sender email');
    expect(screen.getByRole('button', { name: 'Activate' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Sender name'), { target: { value: 'Changed' } });
    expect(screen.getByRole('button', { name: 'Send test email' })).toBeDisabled();
    mocks.save.mockResolvedValue({ ...settings, revision: 2, draft: { ...draft, from_name: 'Changed' } });
    mocks.get.mockResolvedValue({ ...settings, revision: 2, draft: { ...draft, from_name: 'Changed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('workspace-a', 1, expect.objectContaining({ from_name: 'Changed' })));
    mocks.get.mockResolvedValue({ ...settings, revision: 2, tested_revision: 2 });
    mocks.test.mockResolvedValue({ status: 'accepted', message: 'Provider accepted the test email' });
    fireEvent.click(await screen.findByRole('button', { name: 'Send test email' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled());
    expect(mocks.test).toHaveBeenCalledWith('workspace-a', 2);
  });
  it('removes typed credentials when switching workspaces', async () => {
    const view = mount();
    fireEvent.change(await screen.findByLabelText('API key'), { target: { value: 'synthetic-secret' } });
    mocks.scope.activeWorkspace = { id: 'workspace-b', name: 'Other workspace', your_role: 'owner' };
    view.rerender(<QueryClientProvider client={new QueryClient()}><EmailSection /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByLabelText('API key')).toHaveValue(''));
    expect(mocks.get).toHaveBeenCalledWith('workspace-b');
  });
  it('labels SMTP acceptance honestly', async () => {
    mocks.history.mockResolvedValue({ items: [{ message_id: 'one', subject: 'Test', to: 'recipient@example.com', provider: 'smtp', status: 'accepted', source_kind: 'test', created_at: new Date().toISOString() }], next_cursor: null });
    mount();
    expect(await screen.findByText(/Accepted by mail server/)).toBeVisible();
  });
});


it('keeps the form revision when a refetch arrives during editing', async () => {
  const view = mount();
  fireEvent.change(await screen.findByLabelText('Sender name'), { target: { value: 'My edit' } });
  view.client.setQueryData(['workspace-email', 'workspace-a'], { ...settings, revision: 2, mode: 'custom', active: draft, draft: { ...draft, from_name: 'Other admin' } });
  await screen.findByText(/Active: resend/);
  mocks.save.mockRejectedValue({ response: { data: { message: 'Email settings changed. Reload and try again.' } } });
  fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith('workspace-a', 1, expect.objectContaining({ from_name: 'My edit' })));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email settings changed');
});


it('tests the saved draft with an explicitly chosen recipient', async () => {
  mount();
  fireEvent.change(await screen.findByLabelText('Test recipient (optional)'), { target: { value: 'chosen@example.com' } });
  mocks.test.mockResolvedValue({ status: 'accepted', message: 'Provider accepted the test email' });
  fireEvent.click(screen.getByRole('button', { name: 'Send test email' }));
  await waitFor(() => expect(mocks.test).toHaveBeenCalledWith('workspace-a', 1, 'chosen@example.com'));
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
});
