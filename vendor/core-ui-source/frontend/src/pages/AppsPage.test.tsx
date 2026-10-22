import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppsPage } from './AppsPage';
import type { App } from '../types';
import { CHANGE_EVENT_APPLIED } from '../hooks/useChangeEventInvalidation';

const blankAppSavedRef = vi.hoisted(() => ({ current: null as null | ((app: unknown) => void) }));

vi.mock('../components/apps/AppModal', () => ({
  AppModal: ({
    open,
    onSaved,
  }: {
    open: boolean;
    onSaved: (app: unknown) => void;
  }) => {
    blankAppSavedRef.current = onSaved;
    return open ? <div data-testid="blank-app-modal" /> : null;
  },
}));

vi.mock('../components/apps/AppManagerDialog', () => ({
  AppManagerDialog: ({ isOpen, initialDetailId, onClose }: { isOpen: boolean; initialDetailId?: string; onClose(): void }) => isOpen ? <div data-testid="canonical-app-library">{initialDetailId}<button onClick={onClose}>Close App library</button></div> : null,
}));

vi.mock('../components/sidebar/PinButton', () => ({
  PinButton: () => null,
}));

vi.mock('../api', () => ({
  appsApi: {
    list: vi.fn().mockResolvedValue([]),
  },
  workspacesApi: {
    list: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../context/CrumbsContext', () => ({
  useSetCrumbs: vi.fn(),
}));

const mockUseScope = vi.fn();
vi.mock('../context/ScopeContext', () => ({
  useScope: () => mockUseScope(),
}));

const mockUseWorkspaceCreationRights = vi.fn();
vi.mock('../hooks/useWorkspaceCreationRights', () => ({
  useWorkspaceCreationRights: () => mockUseWorkspaceCreationRights(),
}));

vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

function renderPage(url = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}>
        <AppsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppsPage creation rights gating', () => {
  beforeEach(() => {
    mockUseScope.mockReturnValue({
      activeWorkspace: {
        id: 'ws-org',
        kind: 'organization',
        name: 'Acme',
        your_role: 'member',
      },
    });
  });

  it('opens the canonical catalog from a deep link and clears it on close', async () => {
    mockUseWorkspaceCreationRights.mockReturnValue({ canCreateApps: true });
    renderPage('/apps?manage=1&package=lib-hr');
    expect(screen.getByTestId('canonical-app-library')).toHaveTextContent('lib-hr');
    fireEvent.click(screen.getByRole('button', { name: 'Close App library' }));
    expect(screen.queryByTestId('canonical-app-library')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: /manage apps/i }));
    expect(screen.getByTestId('canonical-app-library')).not.toHaveTextContent('lib-hr');
  });

  it('hides Manage apps when the caller cannot create apps', async () => {
    mockUseWorkspaceCreationRights.mockReturnValue({
      canCreateApps: false,
      canCreateTracks: false,
      lacksAppCreationInOrg: true,
      lacksTrackCreationInOrg: true,
    });

    renderPage();

    expect(screen.queryByRole('button', { name: /manage apps/i })).toBeNull();
    expect(
      await screen.findByText(/doesn't include permission to create apps/i),
    ).toBeInTheDocument();
  });

  it('shows Manage apps when the caller can create apps', async () => {
    mockUseWorkspaceCreationRights.mockReturnValue({
      canCreateApps: true,
      canCreateTracks: true,
      lacksAppCreationInOrg: false,
      lacksTrackCreationInOrg: false,
    });

    renderPage();

    expect(
      await screen.findByRole('button', { name: /manage apps/i }),
    ).toBeInTheDocument();
  });

  it('refreshes an open empty list when a governed app creation lands', async () => {
    const { appsApi } = await import('../api');
    vi.mocked(appsApi.list)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'app-1',
          name: 'Car Rental Management',
          description: 'Manage the fleet',
          workspace_id: 'ws-org',
        },
      ]);
    mockUseWorkspaceCreationRights.mockReturnValue({
      canCreateApps: true,
      canCreateTracks: true,
      lacksAppCreationInOrg: false,
      lacksTrackCreationInOrg: false,
    });

    renderPage();
    expect(await screen.findByText('No apps yet')).toBeInTheDocument();

    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT_APPLIED, {
        detail: { id: 'evt-1', action: 'app.create' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Car Rental Management')).toBeInTheDocument();
    });
  });

  it('keeps a blank-created app visible when a stale change-event list omits it', async () => {
    const { appsApi } = await import('../api');
    vi.mocked(appsApi.list).mockResolvedValue([]);
    mockUseWorkspaceCreationRights.mockReturnValue({
      canCreateApps: true,
      canCreateTracks: true,
      lacksAppCreationInOrg: false,
      lacksTrackCreationInOrg: false,
    });

    renderPage();
    expect(await screen.findByText('No apps yet')).toBeInTheDocument();

    blankAppSavedRef.current?.({
      id: 'app-blank',
      name: 'Blank App',
      workspace_id: 'ws-org',
    });

    expect(await screen.findByText('Blank App')).toBeInTheDocument();

    // Stale refetch still returns [] — optimistic row must survive.
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT_APPLIED, {
        detail: { id: 'evt-2', action: 'app.create' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText('Blank App')).toBeInTheDocument();
    });
  });

  it('discards pending rows and in-flight lists from a previous workspace', async () => {
    const { appsApi } = await import('../api');
    vi.mocked(appsApi.list).mockResolvedValue([]);
    let resolveOld!: (apps: App[]) => void;
    mockUseWorkspaceCreationRights.mockReturnValue({ canCreateApps: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page = <QueryClientProvider client={client}><MemoryRouter><AppsPage /></MemoryRouter></QueryClientProvider>;
    const view = render(page);
    expect(await screen.findByText('No apps yet')).toBeInTheDocument();
    act(() => blankAppSavedRef.current?.({ id: 'old-created', name: 'Previous Workspace App', workspace_id: 'ws-org' }));
    expect(screen.getByText('Previous Workspace App')).toBeInTheDocument();
    vi.mocked(appsApi.list).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
    act(() => window.dispatchEvent(new CustomEvent(CHANGE_EVENT_APPLIED, { detail: { action: 'app.create' } })));
    mockUseScope.mockReturnValue({ activeWorkspace: { id: 'ws-new', name: 'New Workspace' } });
    view.rerender(<QueryClientProvider client={client}><MemoryRouter><AppsPage /></MemoryRouter></QueryClientProvider>);
    expect(await screen.findByText('No apps yet')).toBeInTheDocument();
    await act(async () => { resolveOld([{ id: 'old-result', name: 'Stale Workspace App', workspace_id: 'ws-org' }]); });
    expect(screen.queryByText('Previous Workspace App')).not.toBeInTheDocument();
    expect(screen.queryByText('Stale Workspace App')).not.toBeInTheDocument();
  });

  it('retains every acknowledged creation until the scoped list includes them', async () => {
    const { appsApi } = await import('../api');
    vi.mocked(appsApi.list).mockResolvedValue([]);
    mockUseWorkspaceCreationRights.mockReturnValue({ canCreateApps: true });
    renderPage();
    expect(await screen.findByText('No apps yet')).toBeInTheDocument();
    act(() => {
      blankAppSavedRef.current?.({ id: 'created-1', name: 'First Created App', workspace_id: 'ws-org' });
      blankAppSavedRef.current?.({ id: 'created-2', name: 'Second Created App', workspace_id: 'ws-org' });
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT_APPLIED, { detail: { action: 'app.create' } }));
    });
    await waitFor(() => {
      expect(screen.getByText('First Created App')).toBeInTheDocument();
      expect(screen.getByText('Second Created App')).toBeInTheDocument();
    });
  });
  it('retains current app rows and their count while a refresh is pending or fails', async () => {
    const { appsApi } = await import('../api');
    const current = { id: 'app-visible', name: 'Current App', workspace_id: 'ws-org' };
    vi.mocked(appsApi.list).mockResolvedValueOnce([current]);
    mockUseWorkspaceCreationRights.mockReturnValue({ canCreateApps: true });
    renderPage();
    expect(await screen.findByText('Current App')).toBeInTheDocument();
    let rejectRefresh!: (error: Error) => void;
    vi.mocked(appsApi.list).mockImplementationOnce(() => new Promise((_, reject) => { rejectRefresh = reject; }));
    act(() => window.dispatchEvent(new CustomEvent(CHANGE_EVENT_APPLIED, { detail: { action: 'app.update' } })));
    expect(screen.getByText('Current App')).toBeInTheDocument();
    expect(screen.queryByText('No apps yet')).toBeNull();
    await act(async () => rejectRefresh(new Error('offline')));
    expect(await screen.findByText('Failed to load apps')).toBeInTheDocument();
    expect(screen.getByText('Current App')).toBeInTheDocument();
  });

  it('does not publish a zero count before the initial request settles', async () => {
    const { appsApi } = await import('../api');
    vi.mocked(appsApi.list).mockImplementationOnce(() => new Promise(() => {}));
    mockUseWorkspaceCreationRights.mockReturnValue({ canCreateApps: true });
    renderPage();
    expect(screen.getByText(/Loading apps/)).toBeInTheDocument();
    expect(screen.queryByText(/0 apps in/)).toBeNull();
    expect(screen.queryByText('No apps yet')).toBeNull();
  });

});
