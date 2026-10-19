import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ inbox: vi.fn(), respond: vi.fn() }));
vi.mock('../../api/accessControl', () => ({ ownershipConsentApi: mocks }));
import { ownershipRowsForStatus } from './useOwnershipProposals';
import { OwnershipConsentInbox } from './OwnershipConsentInbox';
const proposal = { proposal_id: 'proposal', resource_type: 'app', resource_id: 'app-a', status: 'pending', revision: 2, expires_at: '2026-10-30T00:00:00Z', expired: false, ownership_current: true };
function renderInbox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter><OwnershipConsentInbox /></MemoryRouter></QueryClientProvider>);
}
describe('Recipient ownership consent', () => {
  afterEach(cleanup);
  beforeEach(() => { vi.clearAllMocks(); mocks.inbox.mockResolvedValue({ complete: true, proposals: [proposal] }); mocks.respond.mockResolvedValue({ status: 'accepted' }); });
  it('submits exact current proposal revision only after deliberate acceptance', async () => {
    renderInbox();
    expect(mocks.respond).not.toHaveBeenCalled();
    const accept = await screen.findByRole('button', { name: 'Accept ownership' });
    mocks.inbox.mockResolvedValue({ complete: true, proposals: [] });
    fireEvent.click(accept);
    await waitFor(() => expect(mocks.respond).toHaveBeenCalledWith(proposal, 'accept'));
  });
  it('withholds acceptance for an expired or replaced ownership lifetime', async () => {
    mocks.inbox.mockResolvedValue({ complete: true, proposals: [{ ...proposal, ownership_current: false }] });
    renderInbox();
    await screen.findByText(/owner changed/);
    expect(screen.queryByRole('button', { name: 'Accept ownership' })).not.toBeInTheDocument();
    expect(mocks.respond).not.toHaveBeenCalled();
  });
  it('keeps settled decisions in history after their original expiry', () => {
    const accepted = { ...proposal, status: 'accepted', expired: true };
    const expired = { ...proposal, status: 'pending', expired: true };
    expect(ownershipRowsForStatus([accepted, expired] as never, 'approved')).toEqual([accepted]);
    expect(ownershipRowsForStatus([accepted, expired] as never, 'expired')).toEqual([expired]);
    expect(ownershipRowsForStatus([accepted, expired] as never, 'pending')).toEqual([]);
  });

  it('withholds decisions when the inbox response is incomplete', async () => {
    mocks.inbox.mockResolvedValue({ complete: false, proposals: [proposal] });
    renderInbox();
    expect(await screen.findByText(/could not be loaded/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Accept ownership' })).not.toBeInTheDocument();
    expect(mocks.respond).not.toHaveBeenCalled();
  });

  it('requires an explicit refresh after an unconfirmed decision', async () => {
    mocks.respond.mockRejectedValue(new Error('connection lost'));
    renderInbox();
    fireEvent.click(await screen.findByRole('button', { name: 'Accept ownership' }));
    await screen.findByText(/decision was not confirmed/);
    expect(screen.getByRole('button', { name: 'Accept ownership' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Accept ownership' })).toBeEnabled());
    expect(mocks.respond).toHaveBeenCalledTimes(1);
  });

});
