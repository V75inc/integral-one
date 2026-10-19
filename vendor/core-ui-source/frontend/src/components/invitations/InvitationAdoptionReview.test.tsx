import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ reviewAdoption: vi.fn(), adopt: vi.fn() }));
vi.mock('../../api', () => ({ invitationsApi: mocks }));
import { InvitationAdoptionReview } from './InvitationAdoptionReview';

describe('Owner invitation adoption review', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reviewAdoption.mockResolvedValue({
      review_digest: 'current-digest', email: 'recipient@example.com',
      expires_at: '2026-10-20', original_issuer_id: 'old-issuer',
      requested_role: 'admin', requested_can_create_apps: true,
      target_resource_type: null, target_resource_id: null,
    });
  });

  it('requires deliberate rights selection and submits the current review digest', async () => {
    const onAdopted = vi.fn();
    mocks.adopt.mockResolvedValue({ acceptance_url: 'https://example.com/new-link' });
    render(<InvitationAdoptionReview workspaceId="ws" invitationId="inv" onAdopted={onAdopted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review adoption' }));
    const apply = await screen.findByRole('button', { name: 'Adopt and replace link' });
    expect(apply).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Can create Apps' })).not.toBeChecked();
    fireEvent.change(screen.getByRole('combobox', { name: 'Adopted role' }), { target: { value: 'member' } });
    fireEvent.click(apply);
    await waitFor(() => expect(mocks.adopt).toHaveBeenCalledWith('ws', 'inv', {
      review_digest: 'current-digest', role: 'member', can_create_apps: false, can_create_tracks: false,
    }));
    await waitFor(() => expect(onAdopted).toHaveBeenCalledWith('https://example.com/new-link'));
  });

  it('clears stale review after failure and requires another review before retry', async () => {
    mocks.adopt.mockRejectedValue(new Error('Review conflict'));
    const onAdopted = vi.fn();
    render(<InvitationAdoptionReview workspaceId="ws" invitationId="inv" onAdopted={onAdopted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review adoption' }));
    await screen.findByRole('combobox', { name: 'Adopted role' });
    fireEvent.change(screen.getByRole('combobox', { name: 'Adopted role' }), { target: { value: 'member' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adopt and replace link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Review the current invitation again');
    expect(screen.queryByRole('button', { name: 'Adopt and replace link' })).not.toBeInTheDocument();
    expect(onAdopted).not.toHaveBeenCalled();
  });
});
