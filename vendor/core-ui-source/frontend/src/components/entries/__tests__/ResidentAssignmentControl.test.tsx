import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { entriesApi, type ResidentAssignmentView } from '../../../api/entries';
import { ResidentAssignmentControl } from '../ResidentAssignmentControl';

vi.mock('../../../api/entries', () => ({
  entriesApi: {
    getResidentAssignment: vi.fn(),
    setResidentAssignment: vi.fn(),
    getResidentAssignmentReview: vi.fn(),
    requestResidentAssignmentReview: vi.fn(),
    stageResidentAssignmentPlacement: vi.fn(),
    approveResidentAssignmentReview: vi.fn(),
  },
}));

describe('resident assignment control', () => {
  it('loads a Kanban assignment on demand and refreshes the shared Entry state after writes', async () => {
    const client = new QueryClient();
    let current: ResidentAssignmentView = {
      state: 'withdrawn', revision: 0, can_assign: true, can_withdraw: false,
    };
    vi.mocked(entriesApi.getResidentAssignment).mockImplementation(async () => current);
    vi.mocked(entriesApi.setResidentAssignment).mockImplementation(async (_entry, _workspace, state) => {
      current = {
        state,
        revision: current.revision + 1,
        can_assign: state === 'withdrawn',
        can_withdraw: state === 'assigned',
      };
      return current;
    });
    const props = { entryId: 'entry-1', workspaceId: 'workspace-1' };
    render(
      <QueryClientProvider client={client}>
        <ResidentAssignmentControl {...props} compact />
      </QueryClientProvider>,
    );
    expect(entriesApi.getResidentAssignment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Resident assignment' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to Integral' }));
    await waitFor(() => expect(entriesApi.setResidentAssignment).toHaveBeenCalledWith(
      'entry-1', 'workspace-1', 'assigned', 0,
    ));
    expect(await screen.findByRole('button', { name: 'Assigned to Integral' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw assignment' }));
    await waitFor(() => expect(entriesApi.setResidentAssignment).toHaveBeenLastCalledWith(
      'entry-1', 'workspace-1', 'withdrawn', 1,
    ));
    expect(await screen.findByRole('button', { name: 'Assign to Integral' })).toBeVisible();
  });

  it('shows reviewed limits and approves the displayed digest', async () => {
    const client = new QueryClient();
    const pending = {
      work_item_id: 'work-1',
      review_digest: 'reviewed-digest',
      status: 'waiting_for_human',
      approval_status: 'pending',
      can_approve: true,
      model: 'example-model',
      provider: 'example-provider',
      max_model_requests: 1,
      max_spend_usd: '0.10',
      deadline_at: '2030-01-01T00:00:00Z',
    };
    const approved = { ...pending, approval_status: 'approved', can_approve: false };
    vi.mocked(entriesApi.getResidentAssignment).mockResolvedValue({
      state: 'assigned', revision: 1, can_assign: false, can_withdraw: true,
    });
    vi.mocked(entriesApi.getResidentAssignmentReview).mockResolvedValueOnce(pending)
      .mockResolvedValue(approved);
    vi.mocked(entriesApi.approveResidentAssignmentReview).mockResolvedValue(approved);
    render(
      <QueryClientProvider client={client}>
        <ResidentAssignmentControl entryId="entry-1" workspaceId="workspace-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Preparation review' }));
    expect(await screen.findByText(/example-model via example-provider.*USD 0.10/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Approve private preparation' }));
    await waitFor(() => expect(entriesApi.approveResidentAssignmentReview).toHaveBeenCalledWith(
      'entry-1', 'workspace-1', 'reviewed-digest',
    ));
    expect(await screen.findByText('Approved. Awaiting queue admission.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approve private preparation' })).toBeNull();
  });


  it('lets the sponsor request preparation for the observed assignment revision', async () => {
    const client = new QueryClient();
    vi.mocked(entriesApi.getResidentAssignment).mockResolvedValue({
      state: 'assigned', revision: 4, can_assign: false, can_withdraw: true, can_request_review: true,
    });
    vi.mocked(entriesApi.getResidentAssignmentReview).mockResolvedValue(null);
    vi.mocked(entriesApi.requestResidentAssignmentReview).mockResolvedValue(null);
    render(
      <QueryClientProvider client={client}>
        <ResidentAssignmentControl entryId="entry-1" workspaceId="workspace-1" />
      </QueryClientProvider>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Preparation review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Request preparation review' }));
    await waitFor(() => expect(entriesApi.requestResidentAssignmentReview).toHaveBeenCalledWith(
      'entry-1', 'workspace-1', 4,
    ));
  });


  it('stages placement and directs the sponsor to the standard approval inbox', async () => {
    const client = new QueryClient();
    vi.mocked(entriesApi.getResidentAssignment).mockResolvedValue({
      state: 'assigned', revision: 4, can_assign: false, can_withdraw: true,
    });
    vi.mocked(entriesApi.getResidentAssignmentReview).mockResolvedValue({
      work_item_id: 'work-1',
      review_digest: 'reviewed-digest',
      status: 'succeeded',
      approval_status: 'approved',
      can_approve: false,
      model: 'example-model',
      provider: 'example-provider',
      max_model_requests: 1,
      max_spend_usd: '0.10',
      deadline_at: '2030-01-01T00:00:00Z',
      preparation_thread_id: 'n.ChatThread.private',
    });
    vi.mocked(entriesApi.stageResidentAssignmentPlacement).mockResolvedValue({ proposal_token: 'proposal' });
    render(
      <MemoryRouter>
        <QueryClientProvider client={client}>
          <ResidentAssignmentControl entryId="entry-1" workspaceId="workspace-1" />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Preparation review' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Propose adding draft to Entry' }));
    await waitFor(() => expect(entriesApi.stageResidentAssignmentPlacement).toHaveBeenCalledWith(
      'entry-1', 'workspace-1', 'reviewed-digest',
    ));
    expect(await screen.findByRole('link', { name: 'Review proposed Entry update' }))
      .toHaveAttribute('href', '/approvals');
  });

});
