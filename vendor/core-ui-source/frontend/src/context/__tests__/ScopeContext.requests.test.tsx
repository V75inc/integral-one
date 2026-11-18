import { useEffect } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { ScopeProvider, useScope } from '../ScopeContext';
import { usersApi } from '../../api/users';

const state = vi.hoisted(() => ({ header: null as string | null, reads: [] as string[], userId: 'scope-user' }));
vi.mock('../AuthContext', () => ({ useAuth: () => ({ user: { id: state.userId } }) }));
vi.mock('../../api/client', () => ({ setActiveScopeHeader: (value: string | null) => { state.header = value; } }));
vi.mock('../../api/workspaces', () => ({ workspacesApi: { list: vi.fn() } }));
vi.mock('../../api/users', () => ({ usersApi: { getMyScope: vi.fn(), setMyScope: vi.fn().mockResolvedValue({}) } }));

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.removeItem('integral.scope'); state.reads = []; state.userId = 'scope-user'; });

function Requests() {
  const { scope, setScope } = useScope();
  useEffect(() => { state.reads.push(`${scope?.workspaceId}:${state.header}`); }, [scope?.workspaceId]);
  return <><button onClick={() => setScope({ workspaceId: 'next' })}>Switch</button>
    <button onClick={() => setScope({ workspaceId: 'first' })}>Current App</button></>;
}

it('does not persist scope again when navigating inside the confirmed workspace', async () => {
  localStorage.setItem('integral.scope', JSON.stringify({ workspaceId: 'first' }));
  const client = new QueryClient();
  client.setQueryData(['workspaces'], [{ id: 'first', name: 'First' }, { id: 'next', name: 'Next' }]);
  client.setQueryData(['me', 'scope'], { active_workspace_id: 'first' });
  render(<QueryClientProvider client={client}><ScopeProvider><Requests /></ScopeProvider></QueryClientProvider>);
  for (let i = 0; i < 5; i++) fireEvent.click(screen.getByText('Current App'));
  expect(usersApi.setMyScope).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Switch'));
  await waitFor(() => expect(state.reads).toContain('next:ws:next'));
  expect(usersApi.setMyScope).toHaveBeenCalledExactlyOnceWith('next');
});

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

it('retries a failed scope write instead of treating optimistic state as confirmation', async () => {
  localStorage.setItem('integral.scope', JSON.stringify({ workspaceId: 'first' }));
  const client = new QueryClient();
  client.setQueryData(['workspaces'], [{ id: 'first' }, { id: 'next' }]);
  client.setQueryData(['me', 'scope'], { active_workspace_id: 'first' });
  vi.mocked(usersApi.setMyScope).mockRejectedValueOnce(new Error('offline'));
  render(<QueryClientProvider client={client}><ScopeProvider><Requests /></ScopeProvider></QueryClientProvider>);
  await act(async () => fireEvent.click(screen.getByText('Switch')));
  expect(client.getQueryData(['me', 'scope'])).toEqual({ active_workspace_id: 'next' });
  fireEvent.click(screen.getByText('Switch'));
  await waitFor(() => expect(usersApi.setMyScope).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByText('Switch'));
  expect(usersApi.setMyScope).toHaveBeenCalledTimes(2);
});

it('does not inherit another account’s pending scope confirmation', async () => {
  localStorage.setItem('integral.scope', JSON.stringify({ workspaceId: 'first' }));
  const client = new QueryClient();
  client.setQueryData(['workspaces'], [{ id: 'first' }, { id: 'next' }]);
  client.setQueryData(['me', 'scope'], { active_workspace_id: 'first' });
  let failOld!: (error: Error) => void;
  vi.mocked(usersApi.setMyScope).mockReturnValueOnce(new Promise((_resolve, reject) => { failOld = reject; }));
  const tree = () => <QueryClientProvider client={client}><ScopeProvider><Requests /></ScopeProvider></QueryClientProvider>;
  const view = render(tree());
  fireEvent.click(screen.getByText('Switch'));
  state.userId = 'another-account';
  view.rerender(tree());
  fireEvent.click(screen.getByText('Switch'));
  expect(usersApi.setMyScope).toHaveBeenCalledTimes(2);
  await act(async () => failOld(new Error('old request failed')));
  fireEvent.click(screen.getByText('Switch'));
  expect(usersApi.setMyScope).toHaveBeenCalledTimes(2);
});
