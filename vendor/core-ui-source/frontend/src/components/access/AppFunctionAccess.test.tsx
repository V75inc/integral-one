import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
vi.mock('../../api/accessControl', () => ({ accessControlApi: {
  groups: vi.fn().mockResolvedValue({ groups: [], next_cursor: null }),
  bindings: vi.fn().mockResolvedValue({ bindings: [], definition_id: 'definition', role_actions: {}, next_cursor: null }),
} }));
vi.mock('../../api/workspaces', () => ({ workspacesApi: { listMembers: vi.fn().mockResolvedValue([]) } }));
import { AppFunctionAccess } from './AppFunctionAccess';
afterEach(cleanup);
it('does not show grant controls for an App without function roles', async () => {
  render(<AppFunctionAccess appId="app" workspaceId="ws" />);
  fireEvent.click(screen.getByRole('button', { name: 'Load function roles' }));
  expect(await screen.findByText(/This App has no function roles to grant/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Grant selected function role' })).not.toBeInTheDocument();
});
