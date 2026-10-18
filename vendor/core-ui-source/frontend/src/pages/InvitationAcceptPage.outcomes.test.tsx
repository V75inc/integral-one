import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({ preview: vi.fn(), accept: vi.fn(), showToast: vi.fn() }));
vi.mock('../api', () => ({ invitationsApi: { preview: mocks.preview, accept: mocks.accept } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'recipient' }, loading: false }) }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

import { InvitationAcceptPage } from './InvitationAcceptPage';

describe('Invitation acceptance outcome navigation', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preview.mockResolvedValue({
      invitation: { id: 'invitation', workspace_id: 'target', role: 'admin', status: 'pending' },
      workspace: { id: 'target', name: 'Team' },
    });
  });

  async function acceptResult(role: string | null, outcome: 'conflict' | 'unchanged' | 'created') {
    mocks.accept.mockResolvedValue({
      role,
      invitation: {
        id: 'invitation', workspace_id: 'target', role: 'admin', status: 'accepted',
        grant_receipt: { outcome, granted_role: role, effective_role_at_acceptance: role, revision: 1 },
      },
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/invitations/token']}>
          <Routes>
            <Route path="/invitations/:token" element={<InvitationAcceptPage />} />
            <Route path="/workspaces/target" element={<div>Workspace destination</div>} />
            <Route path="/" element={<div>Home destination</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith('token'));
  }

  it('does not enter a workspace or announce membership when access is absent', async () => {
    await acceptResult(null, 'conflict');
    expect(await screen.findByText('Home destination')).toBeInTheDocument();
    expect(screen.queryByText('Workspace destination')).not.toBeInTheDocument();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('Access was not granted'), 'error');
  });

  it('reports current access after a conflict instead of the requested administrator role', async () => {
    await acceptResult('viewer', 'conflict');
    expect(await screen.findByText('Workspace destination')).toBeInTheDocument();
    expect(mocks.showToast).toHaveBeenCalledWith(expect.stringContaining('Your current role is viewer'), 'success');
    expect(mocks.showToast.mock.calls[0][0]).not.toContain('admin');
  });

  it('describes unchanged rights without claiming a new membership grant', async () => {
    await acceptResult('member', 'unchanged');
    expect(await screen.findByText('Workspace destination')).toBeInTheDocument();
    expect(mocks.showToast).toHaveBeenCalledWith('Your existing member access is unchanged.', 'success');
  });
});
