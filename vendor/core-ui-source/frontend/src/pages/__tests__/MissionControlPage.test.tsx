import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../../context/AuthContext', () => ({ useAuthOptional: () => ({ user: { id: 'u-1' } }) }));

const mockOwnershipInbox = vi.fn(async () => ({ complete: true, proposals: [] }));
vi.mock('../../api/accessControl', () => ({ ownershipConsentApi: { inbox: () => mockOwnershipInbox() } }));

const mockDeployment = vi.hoisted(() => ({ singleUser: false }));
vi.mock('../../hooks/useDeployment', () => ({ useDeployment: () => mockDeployment }));
const mockCredentialGet = vi.hoisted(() => vi.fn());
vi.mock('../../api/modelCredentials', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/modelCredentials')>(),
  modelCredentialsApi: { get: mockCredentialGet },
}));
const mockGetSnapshot = vi.fn();
const mockScopeState = { workspaceId: 'ws-1', accessible: true };
const mockSetScope = vi.fn();
const mockListApprovals = vi.fn(async () => ({ approvals: [] }));
const mockListPendingStagedChanges = vi.fn(async () => []);

vi.mock('../../api/approvals', () => ({
  listApprovals: () => mockListApprovals(),
}));

vi.mock('../../api/agentive', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api/agentive')>();
  return {
    ...actual,
    listPendingStagedChanges: () => mockListPendingStagedChanges(),
  };
});

vi.mock('../../api', async importOriginal => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    missionControlApi: {
      ...actual.missionControlApi,
      getSnapshot: (preview_limit?: number) => mockGetSnapshot(preview_limit),
    },
  };
});

vi.mock('../../context/ScopeContext', async importOriginal => {
  const actual =
    await importOriginal<typeof import('../../context/ScopeContext')>();
  return {
    ...actual,
    useScope: () => ({
      scope: { workspaceId: mockScopeState.workspaceId },
      workspaces: mockScopeState.accessible ? [
        {
          id: 'ws-1',
          kind: 'organization',
          name: 'Workspace One',
          accent_color: '#2244ff',
          avatar_url: null,
        },
        { id: 'ws-2', kind: 'organization', name: 'Workspace Two' },
      ] : [],
      setScope: mockSetScope,
    }),
  };
});

vi.mock('../../context/CrumbsContext', () => ({
  useSetCrumbs: () => vi.fn(),
}));

vi.mock('../../hooks/useNotifications', () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 9,
    loading: false,
    error: null,
    refetch: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    isMarkingRead: false,
    isMarkingAllRead: false,
  }),
}));

vi.mock('../../components/system', () => ({
  notifyApiFailure: vi.fn(),
}));

vi.mock('../../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('../../features/ai-chat/components/HomeChatComposer', () => ({
  HomeChatComposer: ({workspaceId, principalId}: {workspaceId: string | null; principalId: string | null}) =>
    <div data-testid="home-composer" data-workspace={workspaceId ?? ''} data-principal={principalId ?? ''} />,
}));
import { MissionControlPage } from '../MissionControlPage';

afterEach(() => {
  cleanup();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <MissionControlPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('<MissionControlPage /> Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDeployment.singleUser = false;
    mockCredentialGet.mockReset().mockResolvedValue(null);
    mockScopeState.workspaceId = 'ws-1';
    mockScopeState.accessible = true;
    mockGetSnapshot.mockReset();
    mockListApprovals.mockResolvedValue({ approvals: [] });
    mockListPendingStagedChanges.mockResolvedValue([]);
  });
  it('preserves the header, exposes scoped links and canonical record destinations', async () => {
    mockGetSnapshot.mockResolvedValue({ apps: [{ id: 'app-1', name: 'Personal Life Manager', workspace_id: 'ws-1' }], tracks: [],
      preview_entries: [{ id: 'e-1', title: 'Groceries', track_id: 't-1' }, { id: 'e-2', title: 'Coffee' }] });
    renderPage();
    expect(await screen.findByText('Personal Life Manager')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Home' })).toBeVisible();
    expect(screen.getByText('Your workspaces and recent activity in one place. Choose a workspace to get started.')).toBeVisible();
    expect(screen.getByRole('link', { name: /Apps in Workspace One/ })).toHaveAttribute('href', '/apps');
    expect(screen.getByRole('link', { name: /Feed in Workspace One/ })).toHaveAttribute('href', '/feed');
    expect(screen.getByRole('link', { name: /Groceries/ })).toHaveAttribute('href', '/tracks/t-1?entry=e-1');
    expect(screen.getByRole('link', { name: /Coffee/ })).toHaveAttribute('href', '/entries/e-2');
    expect(screen.queryByRole('region', { name: /at a glance/i })).not.toBeInTheDocument();
  });
  it('mounts the shared Home composer with authenticated workspace identity', async () => {
    mockGetSnapshot.mockResolvedValue({ apps: [], tracks: [], preview_entries: [] });
    renderPage();
    await screen.findByText('No pending approvals.');
    expect(screen.getByTestId('home-composer')).toHaveAttribute('data-workspace', 'ws-1');
    expect(screen.getByTestId('home-composer')).toHaveAttribute('data-principal', 'u-1');
  });
  it('does not present unavailable data as an empty first visit and supports retry', async () => {
    mockGetSnapshot.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue({ apps: [], tracks: [], preview_entries: [] });
    renderPage();
    expect(await screen.findByText(/Could not refresh recent work/)).toBeVisible();
    expect(screen.queryByText(/Your recent Apps will appear/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry recent work' }));
    expect(await screen.findByText(/Your recent Apps will appear/)).toBeVisible();
    expect(mockGetSnapshot).toHaveBeenCalledTimes(2);
  });
  it('removes the Home composer workspace when access disappears', async () => {
    mockGetSnapshot.mockResolvedValue({ apps: [], tracks: [], preview_entries: [] });
    const view = renderPage();
    await screen.findByText('No pending approvals.');
    mockScopeState.accessible = false;
    view.rerender(<QueryClientProvider client={view.queryClient}><MemoryRouter><MissionControlPage /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByTestId('home-composer')).toHaveAttribute('data-workspace', '');
  });
  it('shows stable loading sections without an empty-state claim', () => {
    mockGetSnapshot.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getAllByLabelText('Loading recent work')).toHaveLength(2);
    expect(screen.queryByText(/Your recent Apps will appear/)).not.toBeInTheDocument();
  });

  it('keeps available recent work visible when its refresh fails', async () => {
    mockGetSnapshot.mockResolvedValueOnce({ apps: [{ id: 'a1', name: 'Available App' }], tracks: [], preview_entries: [] })
      .mockRejectedValue(new Error('refresh unavailable'));
    const { queryClient } = renderPage();
    expect(await screen.findByText('Available App')).toBeVisible();
    await queryClient.refetchQueries();
    expect(await screen.findByText(/Showing the last available snapshot/)).toBeVisible();
    expect(screen.getByText('Available App')).toBeVisible();
  });


  it('binds the agent to the main active workspace without another workspace selector', async () => {
    mockGetSnapshot.mockResolvedValue({ apps: [], tracks: [], preview_entries: [] });
    const view = renderPage();
    await screen.findByText('No pending approvals.');
    expect(screen.queryByLabelText('AI action workspace')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Agent workspace')).toHaveTextContent('Workspace One');
    mockScopeState.workspaceId = 'ws-2';
    view.rerender(<QueryClientProvider client={view.queryClient}><MemoryRouter><MissionControlPage /></MemoryRouter></QueryClientProvider>);
    expect(screen.getByLabelText('Agent workspace')).toHaveTextContent('Workspace Two');
    expect(screen.getByTestId('home-composer')).toHaveAttribute('data-workspace', 'ws-2');
    expect(screen.queryByText(/Actions stay in/)).not.toBeInTheDocument();
    expect(mockSetScope).not.toHaveBeenCalled();
  });
});


describe('single-user Home AI setup', () => {
  beforeEach(() => {
    mockScopeState.workspaceId = 'ws-1';
    mockScopeState.accessible = true;
    mockDeployment.singleUser = true;
    mockCredentialGet.mockReset().mockResolvedValue(null);
    mockGetSnapshot.mockResolvedValue({ apps: [], tracks: [], preview_entries: [] });
  });

  it('offers optional setup when no configuration is saved', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Set up a local model or bring an API key' })).toBeVisible();
    expect(screen.queryByTestId('home-composer')).not.toBeInTheDocument();
  });

  it.each(['ollama', 'ollama_local'])('shows chat for an active %s configuration, including keyless local models', async provider => {
    mockCredentialGet.mockResolvedValue({ provider, model: 'configured-model', is_active: true });
    renderPage();
    expect(await screen.findByTestId('home-composer')).toHaveAttribute('data-workspace', 'ws-1');
    expect(screen.getByRole('link', { name: 'Manage AI settings' })).toHaveAttribute('href', '/settings#ai-models');
    expect(screen.queryByText('Set up a local model or bring an API key')).not.toBeInTheDocument();
    expect(screen.queryByText(/AI setup is optional/)).not.toBeInTheDocument();
  });

  it('reacts immediately to the same cache updates used by settings save and removal', async () => {
    const { queryClient } = renderPage();
    await screen.findByRole('link', { name: 'Set up a local model or bring an API key' });
    await act(async () => {
      queryClient.setQueryData(['model-credentials', 'me'], { provider: 'ollama', model: 'configured-model', is_active: true });
    });
    expect(await screen.findByTestId('home-composer')).toBeVisible();
    await act(async () => { queryClient.setQueryData(['model-credentials', 'me'], null); });
    expect(await screen.findByRole('link', { name: 'Set up a local model or bring an API key' })).toBeVisible();
    expect(screen.queryByTestId('home-composer')).not.toBeInTheDocument();
  });

  it('does not treat a disabled configuration as active', async () => {
    mockCredentialGet.mockResolvedValue({ provider: 'ollama', model: 'configured-model', is_active: false });
    renderPage();
    expect(await screen.findByRole('link', { name: 'Set up a local model or bring an API key' })).toBeVisible();
    expect(screen.queryByTestId('home-composer')).not.toBeInTheDocument();
  });

  it('does not misreport missing setup when the state is loading or unavailable', async () => {
    let reject!: (reason: Error) => void;
    mockCredentialGet.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    renderPage();
    expect(await screen.findByText('Checking AI setup…')).toBeVisible();
    expect(screen.queryByText('Set up a local model or bring an API key')).not.toBeInTheDocument();
    await act(async () => { reject(new Error('offline')); });
    expect(await screen.findByText('Could not check AI settings.')).toBeVisible();
    expect(screen.queryByText('Set up a local model or bring an API key')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry AI settings' })).toBeVisible();
    mockCredentialGet.mockResolvedValue({ provider: 'ollama', model: 'configured-model', is_active: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry AI settings' }));
    expect(await screen.findByTestId('home-composer')).toBeVisible();
  });
});
