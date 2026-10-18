import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacesPage } from './WorkspacesPage';
import { workspacesApi } from '../api/workspaces';

vi.mock('../context/CrumbsContext', () => ({ useSetCrumbs: vi.fn() }));
vi.mock('../components/workspace/CreateWorkspaceModal', () => ({ CreateWorkspaceModal: () => null }));
vi.mock('../components/workspace/LeaveWorkspaceButton', () => ({ LeaveWorkspaceButton: () => null }));
vi.mock('../api/workspaces', async (original) => ({ ...await original<typeof import('../api/workspaces')>(), workspacesApi: { list: vi.fn() } }));

function page(client: QueryClient) {
  return <QueryClientProvider client={client}><MemoryRouter><WorkspacesPage /></MemoryRouter></QueryClientProvider>;
}

describe('Workspace list refresh recovery', () => {
  it('keeps the last admitted list during a pending or failed background refresh', async () => {
    vi.mocked(workspacesApi.list).mockResolvedValueOnce([{ id: 'ws-one', name: 'One Workspace', kind: 'organization', your_role: 'owner' }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(page(client));
    expect(await screen.findByText('One Workspace')).toBeInTheDocument();
    let rejectRefresh!: (error: Error) => void;
    vi.mocked(workspacesApi.list).mockImplementationOnce(() => new Promise((_, reject) => { rejectRefresh = reject; }));
    act(() => { void client.invalidateQueries({ queryKey: ['workspaces'] }); });
    expect(screen.getByText('One Workspace')).toBeInTheDocument();
    await act(async () => rejectRefresh(new Error('Connection unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection unavailable');
    expect(screen.getByText('One Workspace')).toBeInTheDocument();
    expect(screen.queryByText('No workspaces yet')).toBeNull();
  });

  it('does not claim zero workspaces during initial loading or a failed initial request', async () => {
    let rejectLoad!: (error: Error) => void;
    vi.mocked(workspacesApi.list).mockImplementationOnce(() => new Promise((_, reject) => { rejectLoad = reject; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(page(client));
    expect(screen.getByText('Loading workspaces…')).toBeInTheDocument();
    expect(screen.queryByText('No workspaces yet')).toBeNull();
    await act(async () => rejectLoad(new Error('Unavailable')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
    expect(screen.queryByText('No workspaces yet')).toBeNull();
  });
});
