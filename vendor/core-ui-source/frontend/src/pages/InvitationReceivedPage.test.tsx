import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  user: { id: 'recipient', email_verified: true },
  list: vi.fn(), accept: vi.fn(), showToast: vi.fn(), refreshUser: vi.fn(),
  verify: vi.fn(),
}));
vi.mock('../api', () => ({
  sharingApi: { listMyInvitations: mocks.list, acceptMyInvitation: mocks.accept },
  authApi: { verifyEmail: mocks.verify },
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, loading: false, refreshUser: mocks.refreshUser }),
}));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.showToast }) }));
vi.mock('../hooks/usePublishPageContext', () => ({ usePublishPageContext: vi.fn() }));

import { InvitationReceivedPage } from './InvitationReceivedPage';
import { VerifyEmailPage } from './VerifyEmailPage';

function mount(initialEntries: Array<string | { pathname: string; state: unknown }> = ['/invitations/received/fresh']) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/invitations/received/:invitationId" element={<InvitationReceivedPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/workspaces/team" element={<div>Workspace destination</div>} />
          <Route path="/" element={<div>Home destination</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Invitation mailbox verification and fresh consent', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: 'recipient', email_verified: true };
    mocks.list.mockResolvedValue([{
      id: 'fresh', workspace_id: 'team', workspace_name: 'Team', role: 'member',
    }]);
    mocks.accept.mockResolvedValue({ role: 'member', workspace: { id: 'team' } });
    mocks.verify.mockResolvedValue({});
    mocks.refreshUser.mockImplementation(async () => {
      mocks.user = { ...mocks.user, email_verified: true };
    });
  });

  it('returns an unverified recipient to the same invitation after verification', async () => {
    mocks.user.email_verified = false;
    mount();
    expect(screen.getByText('Verify your email to continue')).toBeInTheDocument();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.queryByText(/already been handled/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
    fireEvent.submit(screen.getByLabelText('Verification code').closest('form')!);
    expect(await screen.findByRole('button', { name: 'Accept' })).toBeInTheDocument();
    expect(mocks.verify).toHaveBeenCalledWith('123456');
    expect(mocks.accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(await screen.findByText('Workspace destination')).toBeInTheDocument();
    expect(mocks.accept).toHaveBeenCalledWith('fresh');
  });

  it('accepts the fresh invitation ID rather than an older invitation', async () => {
    mocks.list.mockResolvedValue([
      { id: 'old-app', role: 'guest' },
      { id: 'fresh', workspace_id: 'team', workspace_name: 'Team', role: 'member' },
    ]);
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(mocks.accept).toHaveBeenCalledWith('fresh'));
  });

  it('retains the unavailable state for an actually absent invitation', async () => {
    mocks.list.mockResolvedValue([]);
    mount();
    expect(await screen.findByText(/not available or has already been handled/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept' })).not.toBeInTheDocument();
  });

  it.each(['https://other.example/', '//other.example/', '/settings', '/invitations/received/fresh?redirect=other'])(
    'does not follow an untrusted verification return destination: %s', async returnTo => {
      mount([{ pathname: '/verify-email', state: { returnTo } }]);
      fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '123456' } });
      fireEvent.submit(screen.getByLabelText('Verification code').closest('form')!);
      expect(await screen.findByText('Home destination')).toBeInTheDocument();
    },
  );
});
