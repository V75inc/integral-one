import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  noop: vi.fn(),
  user: { id: 'n.User.editor', user_id: 'o.User.editor' },
}));

vi.mock('../../api/client', () => ({ default: { get: mocks.get } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.noop }) }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => mocks.noop }));
vi.mock('../../context/CrumbsContext', () => ({ useSetCrumbs: () => mocks.noop }));
vi.mock('../../context/ChatPageFocusContext', () => ({
  useChatPageFocus: () => ({ setPageContext: mocks.noop, clearPageContext: mocks.noop }),
}));
vi.mock('../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws' }, setScope: mocks.noop, workspaces: [{ id: 'ws', your_role: 'member' }] }),
}));
vi.mock('../../hooks/useRecents', () => ({ useRecents: () => ({ visit: mocks.noop }) }));
vi.mock('../../hooks/useWorkspaceCrumbPrefix', () => ({ useWorkspaceCrumbPrefix: () => [] }));
vi.mock('../../hooks/useWorkspaceCreationRights', () => ({
  useWorkspaceCreationRights: () => ({ canCreateTracks: false, canCreateApps: false }),
}));
vi.mock('../../components/sidebar/PinButton', () => ({ PinButton: () => null }));
vi.mock('../../components/tracks/TrackModal', () => ({ TrackModal: () => null }));
vi.mock('../../components/apps/AppModal', () => ({ AppModal: () => null }));
vi.mock('../../components/apps/AppSettingsModal', () => ({ AppSettingsModal: () => null }));
vi.mock('../../components/library/DeriveLibraryPackageModal', () => ({ DeriveLibraryPackageModal: () => null }));
vi.mock('../../features/app-dashboards/AppDashboardPanel', () => ({
  AppDashboardPanel: ({ canEdit }: { canEdit: boolean }) => <div data-testid="dashboard-rights">{canEdit ? 'editable' : 'read-only'}</div>,
}));

import { AppDetailPage } from '../AppDetailPage';

afterEach(() => {
  cleanup();
  localStorage.removeItem('integral:app-section:app');
});
beforeEach(() => {
  mocks.get.mockReset();
  localStorage.setItem('integral:app-section:app', 'dashboards');
});

it.each(['editor', 'commenter', 'viewer', null])('uses caller role %s when the collaborator directory is hidden', async role => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Shared app', owner_user_id: 'n.User.owner', workspace_id: 'ws' } } };
    if (url === '/apps/app/collaborators') return { data: { collaborators: [], total: 2, effective_total: 2, caller_role: role, directory_visible: false } };
    if (url === '/apps/app/tracks' || url === '/tracks') return { data: { tracks: [] } };
    if (url.includes('home')) return { data: { home: null } };
    if (url.includes('dashboards')) return { data: { dashboards: [] } };
    return { data: {} };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(screen.getByTestId('dashboard-rights').textContent).toBe(role === 'editor' ? 'editable' : 'read-only'));
  const collaborators = screen.getByRole('button', { name: 'Collaborators, 2 people' });
  expect(collaborators).toHaveTextContent('2 collaborators');
  fireEvent.click(collaborators);
  expect(screen.getByText('Collaborator details are visible to the owner and admins.')).toBeInTheDocument();
  expect(screen.queryByText('No one else has been added yet.')).not.toBeInTheDocument();
});


it('keeps Collaborators focused on people and places access details in its footer', async () => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Shared app', owner_user_id: 'n.User.owner', workspace_id: 'ws' } } };
    if (url === '/apps/app/collaborators') return { data: { collaborators: [], caller_role: 'admin', directory_visible: true } };
    if (url === '/apps/app/access') return { data: { effective_role: 'admin', links_visible: false } };
    if (url.includes('home')) return { data: { home: null } };
    return { data: { tracks: [], dashboards: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^Collaborators$/ }));
  expect(screen.getByRole('dialog', { name: 'Collaborators' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Manage App function access' })).not.toBeInTheDocument();
  const accessButton = screen.getByRole('button', { name: /^Access details$/ });
  expect(accessButton.parentElement).toHaveClass('sticky', 'bottom-0');
  fireEvent.click(accessButton);
  expect(await screen.findByRole('dialog', { name: 'Access details' })).toBeInTheDocument();
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/apps/app/access'));
  expect(screen.queryByRole('dialog', { name: 'Collaborators' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to collaborators' }));
  expect(await screen.findByRole('dialog', { name: 'Collaborators' })).toBeInTheDocument();
});
