import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), listMembers: vi.fn(), listInvitations: vi.fn(),
  patchMember: vi.fn(), removeMember: vi.fn(),
}));
vi.mock('../api', () => ({ workspacesApi: mocks, invitationsApi: {} }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'caller' } }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => vi.fn() }));
vi.mock('../context/CrumbsContext', () => ({ useSetCrumbs: () => {} }));
vi.mock('../hooks/usePublishPageContext', () => ({ usePublishPageContext: () => {} }));
vi.mock('../components/collab/UserSearchPicker', () => ({ UserSearchPicker: () => null }));

import { WorkspaceMembersPage } from './WorkspaceMembersPage';

describe('Workspace membership authority controls', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ id: 'ws', name: 'Team', kind: 'organization' });
    mocks.listInvitations.mockResolvedValue([]);
    mocks.patchMember.mockResolvedValue({});
  });

  async function page(role: 'owner' | 'admin') {
    mocks.listMembers.mockResolvedValue([
      { id: 'caller', display_name: 'Caller', role },
      { id: 'basic', display_name: 'Basic member', role: 'member', can_create_apps: false, can_create_tracks: false },
      { id: 'peer', display_name: 'Admin peer', role: 'admin' },
      { id: 'creator', display_name: 'Resource creator', role: 'member', can_create_tracks: true },
    ]);
    render(<QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/workspaces/ws/members']}>
        <Routes><Route path="/workspaces/:workspaceId/members" element={<WorkspaceMembersPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>);
    return screen.findByRole('combobox', { name: 'Change role for Basic member' });
  }

  it('limits administrators to basic peers and does not offer delegation of protected rights', async () => {
    const basic = await page('admin');
    expect(within(basic).queryByRole('option', { name: 'Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Change role for Admin peer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Change role for Resource creator' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Change role for Caller' })).not.toBeInTheDocument();
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeDisabled();
    fireEvent.change(basic, { target: { value: 'guest' } });
    await waitFor(() => expect(mocks.patchMember).toHaveBeenCalledWith('ws', 'basic', { role: 'guest' }));
  });

  it('lets the owner govern protected peers and deliberately designate creation rights', async () => {
    const basic = await page('owner');
    expect(within(basic).getByRole('option', { name: 'Admin' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Change role for Admin peer' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Change role for Resource creator' })).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    for (const box of boxes) expect(box).toBeEnabled();
  });
});
