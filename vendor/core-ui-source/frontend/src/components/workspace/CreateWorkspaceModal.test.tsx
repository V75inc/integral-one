import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
const mocks = vi.hoisted(() => ({ create: vi.fn(), toast: vi.fn() }));
vi.mock('../../api/workspaces', async importOriginal => ({ ...await importOriginal<typeof import('../../api/workspaces')>(), workspacesApi: { create: mocks.create } }));
vi.mock('../../api/operationalModels', () => ({ operationalModelsApi: { list: async () => [{ id: 'library-1', name: 'Example App', manifest: {} }] } }));
vi.mock('../apps/appBundleMatching', () => ({ filterAppScopedLibraryPackages: (rows: unknown[]) => rows, extractPackageMeta: () => ({ name: 'Example App', description: '', slug: 'example' }) }));
vi.mock('../../lib/operationalModelManifest', () => ({ summarizeLibraryManifest: () => ({ prescribedTrackCount: 1, skillCount: 1, agentCount: 0 }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.toast }) }));
afterEach(() => { cleanup(); mocks.create.mockReset(); mocks.toast.mockReset(); });

async function create(provisioning: unknown) {
  const onClose = vi.fn(); const onCreated = vi.fn();
  mocks.create.mockResolvedValue({ id: 'new-workspace', name: 'Workspace fixture', kind: 'personal', provisioning });
  render(<QueryClientProvider client={new QueryClient()}><CreateWorkspaceModal open onClose={onClose} onCreated={onCreated} /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Workspace fixture' } });
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(await screen.findByRole('button', { name: /Example App/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  return { onClose, onCreated };
}

describe('workspace provisioning feedback', () => {
  it('keeps per-App entitlement denial visible until the founder continues', async () => {
    const callbacks = await create({ installed: 0, failed: 1, awaiting_settings: 0, failures: [{ library_cp_id: 'library-1', name: 'Example App', error_code: 'entitlement.required' }] });
    await screen.findByRole('heading', { name: 'Example App was not installed' });
    expect(screen.getByText(/Access to this App is not active/)).toBeVisible();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onCreated).not.toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Continue to workspace'));
    expect(callbacks.onCreated).toHaveBeenCalledTimes(1);
    expect(callbacks.onClose).toHaveBeenCalledTimes(1);
  });
  it('explains partial success and settings without recreating the workspace', async () => {
    const callbacks = await create({ installed: 1, failed: 1, awaiting_settings: 1, failures: [{ library_cp_id: 'library-1', name: 'Example App', error_code: 'install_failed' }] });
    await screen.findByText(/Review this App’s requirements/);
    expect(screen.getByText(/1 Apps installed · 1 failed · 1 need settings/)).toBeVisible();
    expect(screen.getByText(/Creating another workspace is not required/)).toBeVisible();
    expect(callbacks.onCreated).not.toHaveBeenCalled();
  });
  it('closes the unchanged successful install flow', async () => {
    const callbacks = await create({ installed: 1, failed: 0, awaiting_settings: 0 });
    await screen.findByText(/Add apps to/).catch(() => undefined);
    await vi.waitFor(() => expect(callbacks.onCreated).toHaveBeenCalledTimes(1));
    expect(mocks.toast).toHaveBeenCalledWith('Workspace created · 1 app installed', 'success');
  });
});
