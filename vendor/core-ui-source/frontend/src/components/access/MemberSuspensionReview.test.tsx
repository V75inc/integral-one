import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ reviewSuspension: vi.fn(), setSuspension: vi.fn() }));
vi.mock('../../api/accessControl', () => ({ accessControlApi: mocks }));
import { MemberSuspensionReview } from './MemberSuspensionReview';

describe('Reviewed workspace suspension', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reviewSuspension.mockResolvedValue({ state: 'suspended', revision: 4, membership_role: 'member', membership_retained: true, reviewed_access_digest: 'current-review', retained_access: [{ resource_type: 'track', resource_id: 'track-a', role: 'viewer', source: 'direct' }] });
    mocks.setSuspension.mockResolvedValue({ changed: true });
  });
  it('requires a successful concrete review and submits its current revision and digest', async () => {
    render(<MemberSuspensionReview workspaceId="ws" memberId="member" name="Alex" />);
    expect(mocks.reviewSuspension).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Resume reviewed access' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review access for Alex' }));
    expect(await screen.findByText('track: track-a · viewer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume reviewed access' }));
    await waitFor(() => expect(mocks.setSuspension).toHaveBeenCalledWith('ws', 'member', false, expect.objectContaining({ revision: 4, reviewed_access_digest: 'current-review' })));
  });
  it('discards a stale review on failure and requires a new review', async () => {
    mocks.setSuspension.mockRejectedValue(new Error('Stale review'));
    render(<MemberSuspensionReview workspaceId="ws" memberId="member" name="Alex" />);
    fireEvent.click(screen.getByRole('button', { name: 'Review access for Alex' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Resume reviewed access' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Load a fresh review');
    expect(screen.queryByRole('button', { name: 'Resume reviewed access' })).not.toBeInTheDocument();
  });
});
