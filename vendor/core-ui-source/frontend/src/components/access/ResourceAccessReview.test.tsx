import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), remove: vi.fn(), confirm: vi.fn() }));
vi.mock('../../api/client', () => ({ default: { get: mocks.get, put: mocks.put, delete: mocks.remove } }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => mocks.confirm }));
import { ResourceAccessReview } from './ResourceAccessReview';
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.confirm.mockResolvedValue(false); });
it('shows known names and plain access labels without internal identifiers', async () => {
  mocks.get.mockResolvedValue({ data: { effective_role: 'owner', links_visible: true, complete: true, governance: {}, effective_access: [{ user_id: 'n.User.owner', role: 'owner' }], sources: [{ source_id: 'edge-1', user_id: 'n.User.owner', resource_id: 'ws', source: 'IS_MEMBER_OF', role: 'owner' }] } });
  render(<ResourceAccessReview resourceType="app" resourceId="app" autoLoad people={[{ id: 'n.User.owner', display_name: 'Jamie' }]} currentUser={{ id: 'n.User.owner', display_name: 'Jamie' }} />);
  expect(await screen.findByText('Jamie (you)')).toBeInTheDocument();
  expect(screen.getByText('Workspace membership · Owner')).toBeInTheDocument();
  expect(screen.queryByText(/n\.User|IS_MEMBER_OF|subtree/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pause access' })).not.toBeInTheDocument();
});
it('confirms a named access pause and does not mutate when cancelled', async () => {
  mocks.get.mockResolvedValue({ data: { effective_role: 'owner', links_visible: true, complete: true, effective_access: [{ user_id: 'person', role: 'viewer' }], sources: [] } });
  render(<ResourceAccessReview resourceType="app" resourceId="app" autoLoad people={[{ id: 'person', display_name: 'Alex' }]} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pause access' }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pause access?', message: expect.stringContaining('Alex') })));
  expect(mocks.put).not.toHaveBeenCalled();
});
it('does not expose an unknown member identifier or offer an unnamed mutation', async () => {
  mocks.get.mockResolvedValue({ data: { effective_role: 'admin', links_visible: true, complete: true, effective_access: [{ user_id: 'n.User.private-id', role: 'viewer' }], sources: [] } });
  render(<ResourceAccessReview resourceType="track" resourceId="track" autoLoad />);
  expect(await screen.findByText('Member name unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pause access' })).toBeDisabled();
  expect(screen.queryByText(/private-id/)).not.toBeInTheDocument();
});
