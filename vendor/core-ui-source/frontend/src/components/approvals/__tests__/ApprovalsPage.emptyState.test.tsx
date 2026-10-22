/**
 * Page-level wiring for the two approval queues.
 *
 * `ApprovalsListBody` learned to stay quiet via `hideEmptyState`, but the
 * bug was only fixed once the page passed it. Observed live: "0 items" was
 * wrong too — the header read "1 item", the body read "No pending
 * approvals", and a pending staged change sat right below. This pins the
 * page's own logic, which the component-level test cannot reach.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfirmProvider } from '../../../context/ConfirmContext';
import '@testing-library/jest-dom/vitest';

vi.mock('../../../api/accessControl', () => ({
  ownershipConsentApi: { inbox: vi.fn(async () => ({ complete: true, proposals: [] })), respond: vi.fn() },
}));

vi.mock('../../../api/approvals', () => ({
  listApprovals: vi.fn(async () => ({ approvals: [] })),
  approveApproval: vi.fn(),
  rejectApproval: vi.fn(),
}));

vi.mock('../../../api/agentive', () => ({
  listPendingStagedChanges: vi.fn(async () => []),
  blessStagingToken: vi.fn(),
  revokeStagingToken: vi.fn(),
  rollbackStagingToken: vi.fn(),
  // The row reconciles on mount; `pending` keeps it in the state this test is
  // about. Returning null would resolve it to `expired`, which is a different
  // scenario entirely.
  getStagingTokenState: vi.fn(async () => ({ state: 'pending' })),
  getStagingRollbackStatus: vi.fn(async () => ({ ok: true, available: false })),
}));

vi.mock('../../../context/CrumbsContext', () => ({
  useSetCrumbs: () => {},
}));

import { ownershipConsentApi } from '../../../api/accessControl';
import * as agentiveApi from '../../../api/agentive';
import * as approvalsApi from '../../../api/approvals';
import { ApprovalsPage } from '../ApprovalsPage';

const stagedChange = {
  token: 'tok-1',
  kind: 'batch',
  summary: 'Client Work tracker: Clients track + Tasks track',
  diff_human: '',
  state: 'pending',
  created_at: new Date(0).toISOString(),
  expires_at: new Date(0).toISOString(),
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmProvider><MemoryRouter>
        <ApprovalsPage />
      </MemoryRouter></ConfirmProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(ownershipConsentApi.inbox).mockResolvedValue({ complete: true, proposals: [] });
  vi.mocked(approvalsApi.listApprovals).mockResolvedValue({ approvals: [], next_cursor: null, has_more: false });
  vi.mocked(agentiveApi.listPendingStagedChanges).mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ApprovalsPage empty state', () => {
  it('does not announce all clear while the proposal read is still loading', async () => {
    let release!: (rows: never[]) => void;
    vi.mocked(agentiveApi.listPendingStagedChanges).mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    renderPage();
    expect(await screen.findByText('Checking approvals…')).toBeInTheDocument();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
    await act(async () => release([]));
    expect(await screen.findByText('All clear')).toBeInTheDocument();
  });

  it('does not declare an unreadable proposal queue empty', async () => {
    vi.mocked(agentiveApi.listPendingStagedChanges).mockRejectedValue(new Error('offline'));
    renderPage();
    expect(await screen.findByText('Could not refresh approvals')).toBeInTheDocument();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
  });
  it('reports a failed initial policy read instead of remaining in checking or all clear', async () => {
    vi.mocked(approvalsApi.listApprovals).mockRejectedValue(new Error('policy queue offline'));
    renderPage();
    expect(await screen.findByText('Could not refresh approvals')).toBeInTheDocument();
    expect(screen.queryByText('Checking approvals…')).not.toBeInTheDocument();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
  });

  it('says nothing is pending only when both queues are empty', async () => {
    renderPage();
    expect(await screen.findByText('No pending approvals')).toBeInTheDocument();
    expect(screen.getByText('All clear')).toBeInTheDocument();
  });

  it('suppresses the empty state when a staged change is pending', async () => {
    vi.mocked(agentiveApi.listPendingStagedChanges).mockResolvedValue([
      stagedChange,
    ] as never);

    renderPage();

    // The staged row arrives...
    expect(
      await screen.findByText(/Client Work tracker/),
    ).toBeInTheDocument();
    // ...and the policy list must not contradict it.
    await waitFor(() =>
      expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeInTheDocument();
  });
  it('includes ownership requests without declaring the other queues all clear', async () => {
    vi.mocked(ownershipConsentApi.inbox).mockResolvedValue({
      complete: true, proposals: [{ proposal_id: 'own-1', resource_type: 'track', resource_id: 'track-a', status: 'pending', revision: 2, expired: false, ownership_current: true, expires_at: '2026-10-30T00:00:00Z' } as never],
    });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Accept ownership' })).toBeVisible();
    expect(screen.getByText('1 item')).toBeVisible();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
    expect(ownershipConsentApi.respond).not.toHaveBeenCalled();
  });

  it('does not call an incomplete ownership inbox all clear', async () => {
    vi.mocked(ownershipConsentApi.inbox).mockResolvedValue({ complete: false, proposals: [] });
    renderPage();
    expect(await screen.findByText('Could not refresh approvals')).toBeVisible();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
  });

  it('shows accepted ownership requests under the approved filter', async () => {
    vi.mocked(ownershipConsentApi.inbox).mockResolvedValue({
      complete: true, proposals: [{ proposal_id: 'own-1', resource_type: 'track', resource_id: 'track-a', status: 'accepted', revision: 3, expired: false, ownership_current: true, expires_at: '2026-10-30T00:00:00Z' } as never],
    });
    renderPage();
    await screen.findByText('All clear');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'approved' } });
    expect(await screen.findByText('Ownership transfer for Track')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Accept ownership' })).not.toBeInTheDocument();
    expect(screen.getByText('1 item')).toBeVisible();
  });

});

vi.mock('../../../api/designDecisions', () => ({ listDesignDecisions: vi.fn(async () => []), discardDesign: vi.fn() }));
