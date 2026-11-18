import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import apiClient from '../api/client';
import { openEventStream } from '../api/events';
import { useChangeEventInvalidation } from '../hooks/useChangeEventInvalidation';
import { AppsPage } from './AppsPage';

vi.mock('../components/apps/AppModal', () => ({ AppModal: () => null }));
vi.mock('../components/apps/AppManagerDialog', () => ({ AppManagerDialog: () => null }));
vi.mock('../components/sidebar/PinButton', () => ({ PinButton: () => null }));
vi.mock('../context/CrumbsContext', () => ({ useSetCrumbs: vi.fn() }));
vi.mock('../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../context/ScopeContext', () => {
  const state = { scope: { workspaceId: 'replay-workspace' }, activeWorkspace: { id: 'replay-workspace', name: 'Replay Workspace', your_role: 'viewer' }, workspaces: [] };
  return { useScope: () => state, useScopeOptional: () => state };
});
vi.mock('../hooks/useWorkspaceCreationRights', () => ({ useWorkspaceCreationRights: () => ({ canCreateApps: false, lacksAppCreationInOrg: false }) }));
vi.mock('../context/AuthContext', async importOriginal => ({
  ...await importOriginal<typeof import('../context/AuthContext')>(),
  useAuth: () => ({ token: 'test-token', user: { id: 'replay-principal' } }),
}));
vi.mock('../api/events', async importOriginal => ({
  ...await importOriginal<typeof import('../api/events')>(),
  openEventStream: vi.fn(),
}));
vi.mock('../api', () => ({ appsApi: { list: vi.fn() }, workspacesApi: { list: vi.fn() } }));

function ObservedApps() {
  useChangeEventInvalidation();
  return <AppsPage />;
}

it('recovers an already-open empty Apps page through authorized history after stream reconnect', async () => {
  const { appsApi } = await import('../api');
  vi.useFakeTimers();
  let committed = false;
  const app = { id: 'committed-app', name: 'Recovered App', workspace_id: 'replay-workspace' };
  vi.mocked(appsApi.list).mockImplementation(async () => committed ? [app] : []);
  const socket = { close: vi.fn() } as unknown as WebSocket;
  vi.mocked(openEventStream).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(socket);
  const get = vi.spyOn(apiClient, 'get').mockImplementation(async (_path, config) => {
    const resourceScope = (config?.params as { scope?: string } | undefined)?.scope;
    return {
      data: {
        // Match the backend resource-scope filter: user: history has no App fact.
        events: committed && !resourceScope ? [{ id: 'committed-event', ts: '2026-11-15T00:00:00Z', actor_kind: 'human', actor_id: 'another-writer', action: 'app.create', resource_type: 'App', resource_id: app.id, scope: `app:${app.id}` }] : [],
        has_more: false, next_cursor: null, resume_cursor: 'workspace-bound-progress',
      },
    } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><MemoryRouter><ObservedApps /></MemoryRouter></QueryClientProvider>);
  try {
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText('No apps yet')).toBeInTheDocument();
    committed = true;
    // No live frame, manual refresh, page navigation or browser reload occurs.
    await act(async () => { await vi.advanceTimersByTimeAsync(16_000); });
    expect(openEventStream).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledWith('/events', { params: { limit: 50 } });
    expect(screen.getByText('Recovered App')).toBeInTheDocument();
    expect(screen.queryByText('No apps yet')).not.toBeInTheDocument();
    expect(appsApi.list).toHaveBeenCalledTimes(2);
  } finally {
    view.unmount();
    client.clear();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
