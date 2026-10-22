import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '../../../context/ConfirmContext';
import '@testing-library/jest-dom/vitest';

const { refreshNotifications, markRead, markAllRead } = vi.hoisted(() => ({
  refreshNotifications: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn(),
}));
vi.mock('../../../hooks/useNotifications', () => ({
  useNotifications: () => ({ notifications: [], loading: false, error: null,
    refetch: refreshNotifications, markRead, markAllRead, unreadCount: 0,
    isMarkingAllRead: false }),
}));
vi.mock('../../../api/approvals', () => ({
  listApprovals: vi.fn(async () => ({ approvals: [] })),
  approveApproval: vi.fn(), rejectApproval: vi.fn(),
}));
vi.mock('../../../api/agentive', () => ({ listPendingStagedChanges: vi.fn() }));
const { bless } = vi.hoisted(() => ({ bless: vi.fn() }));
vi.mock('../../../features/ai-chat/staging/useStagedChange', () => ({
  useStagedChange: () => ({ busy: false, error: null, state: 'pending',
    status: { kind: 'idle', state: 'pending' }, isBlessed: false, isTerminal: false,
    bless, revoke: vi.fn() }),
}));
import { listPendingStagedChanges } from '../../../api/agentive';
import { NotificationsHeaderButton } from '../NotificationsHeaderButton';
const staged = { _kind: 'staged_change' as const, token: 'review-one', kind: 'invoke_app_operation',
  summary: 'Save selected source material', diff_human: 'Exact selected passages and limitations.',
  diff_machine: {}, state: 'pending' as const,
  created_at: '2026-10-11T00:00:00Z', expires_at: '2026-10-11T01:00:00Z',
  autonomy_grant_used: false };
function showHeader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ConfirmProvider><MemoryRouter>
    <NotificationsHeaderButton />
  </MemoryRouter></ConfirmProvider></QueryClientProvider>);
}
beforeEach(() => {
  vi.mocked(listPendingStagedChanges).mockResolvedValue([staged]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('global Inbox proposal review', () => {
  it('counts sessionless proposals and offers the exact local review without claiming all clear', async () => {
    showHeader();
    fireEvent.click(await screen.findByRole('button', { name: /Inbox.*1 approval$/ }));
    fireEvent.click(screen.getByRole('tab', { name: /Approvals/ }));
    expect(await screen.findByText('1 pending')).toBeInTheDocument();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review staged change' }));
    expect(await screen.findByText('Exact selected passages and limitations.')).toBeInTheDocument();
    expect(bless).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^Approve$/ }));
    expect(bless).toHaveBeenCalledOnce();
  });
  it('waits for the proposal read before declaring the queues empty', async () => {
    let release!: (rows: never[]) => void;
    vi.mocked(listPendingStagedChanges).mockReturnValueOnce(new Promise<never[]>(resolve => { release = resolve; }));
    showHeader();
    fireEvent.click(await screen.findByRole('button', { name: 'Inbox' }));
    fireEvent.click(screen.getByRole('tab', { name: /Approvals/ }));
    expect(await screen.findByText('Checking approvals…')).toBeInTheDocument();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
    await act(async () => release([]));
    expect(await screen.findByText('All clear')).toBeInTheDocument();
  });
  it('does not claim all clear when proposal refresh fails', async () => {
    vi.mocked(listPendingStagedChanges).mockRejectedValue(new Error('offline'));
    showHeader();
    fireEvent.click(await screen.findByRole('button', { name: 'Inbox' }));
    fireEvent.click(screen.getByRole('tab', { name: /Approvals/ }));
    expect(await screen.findByText('Could not refresh approvals')).toBeInTheDocument();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
  });
});

vi.mock('../../../api/designDecisions', () => ({ listDesignDecisions: vi.fn(async () => []), discardDesign: vi.fn() }));
