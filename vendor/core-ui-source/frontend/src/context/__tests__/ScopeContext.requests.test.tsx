import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { ScopeProvider, useScope } from '../ScopeContext';

const state = vi.hoisted(() => ({ header: null as string | null, reads: [] as string[] }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: { id: 'scope-user' } }) }));
vi.mock('../../api/client', () => ({ setActiveScopeHeader: (value: string | null) => { state.header = value; } }));
vi.mock('../../api/workspaces', () => ({ workspacesApi: { list: vi.fn() } }));
vi.mock('../../api/users', () => ({ usersApi: { getMyScope: vi.fn(), setMyScope: vi.fn().mockResolvedValue({}) } }));

function Requests() {
  const { scope, setScope } = useScope();
  useEffect(() => { state.reads.push(`${scope?.workspaceId}:${state.header}`); }, [scope?.workspaceId]);
  return <button onClick={() => setScope({ workspaceId: 'next' })}>Switch</button>;
}

it('publishes scope before the first child request and before requests after switching', async () => {
  window.localStorage.setItem('integral.scope', JSON.stringify({ workspaceId: 'first' }));
  const client = new QueryClient();
  client.setQueryData(['workspaces'], [{ id: 'first', name: 'First' }, { id: 'next', name: 'Next' }]);
  client.setQueryData(['me', 'scope'], { active_workspace_id: 'first' });
  render(<QueryClientProvider client={client}><ScopeProvider><Requests /></ScopeProvider></QueryClientProvider>);
  await waitFor(() => expect(state.reads).toContain('first:ws:first'));
  fireEvent.click(screen.getByText('Switch'));
  await waitFor(() => expect(state.reads).toContain('next:ws:next'));
  expect(state.reads).not.toContain('next:ws:first');
  window.localStorage.removeItem('integral.scope');
});
