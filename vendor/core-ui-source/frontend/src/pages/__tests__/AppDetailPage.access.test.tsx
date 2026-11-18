import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  workspaceRole: 'member',
  noop: vi.fn(),
  crumbs: vi.fn(),
  focus: vi.fn(),
  clearFocus: vi.fn(),
  workspaceCrumbs: vi.fn(),
  setScope: vi.fn(),
  user: { id: 'n.User.editor', user_id: 'o.User.editor' },
}));

vi.mock('../../api/client', () => ({ default: { get: mocks.get } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => ({ showToast: mocks.noop }) }));
vi.mock('../../context/ConfirmContext', () => ({ useConfirm: () => mocks.noop }));
vi.mock('../../context/CrumbsContext', () => ({ useSetCrumbs: (...args: unknown[]) => mocks.crumbs(...args) }));
vi.mock('../../context/ChatPageFocusContext', () => ({
  useChatPageFocus: () => ({ setPageContext: mocks.focus, clearPageContext: mocks.clearFocus }),
}));
vi.mock('../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws' }, setScope: mocks.setScope, workspaces: [{ id: 'ws', your_role: mocks.workspaceRole }] }),
}));
vi.mock('../../hooks/useRecents', () => ({ useRecents: () => ({ visit: mocks.noop }) }));
vi.mock('../../hooks/useWorkspaceCrumbPrefix', () => ({ useWorkspaceCrumbPrefix: (id: unknown) => { mocks.workspaceCrumbs(id); return []; } }));
vi.mock('../../hooks/useWorkspaceCreationRights', () => ({
  useWorkspaceCreationRights: () => ({ canCreateTracks: false, canCreateApps: false }),
}));
vi.mock('../../components/sidebar/PinButton', () => ({ PinButton: () => null }));
vi.mock('../../components/tracks/TrackModal', () => ({ TrackModal: () => null }));
vi.mock('../../components/apps/AppModal', () => ({ AppModal: () => null }));
vi.mock('../../components/apps/AppSettingsModal', () => ({ AppSettingsModal: () => null }));
vi.mock('../../components/library/DeriveLibraryPackageModal', () => ({ DeriveLibraryPackageModal: () => null }));
vi.mock('../../features/app-dashboards/AppDashboardPanel', () => ({
  AppDashboardPanel: ({ canEdit }: { canEdit: boolean }) => <div data-testid="dashboard-rights">{canEdit ? 'editable' : 'read-only'}</div>,
}));

vi.mock('../../features/app-dashboards/AppHomePanel', () => ({
  AppHomePanel: () => <div data-testid="app-home">App Home</div>,
}));

import { AppDetailPage } from '../AppDetailPage';

afterEach(() => {
  cleanup();
  localStorage.removeItem('integral:app-section:app');
});
beforeEach(() => {
  mocks.get.mockReset();
  mocks.crumbs.mockClear();
  mocks.focus.mockClear();
  mocks.clearFocus.mockClear();
  mocks.workspaceCrumbs.mockClear();
  mocks.setScope.mockClear();
  mocks.workspaceRole = 'member';
  mocks.user = { id: 'n.User.editor', user_id: 'o.User.editor' };
  localStorage.setItem('integral:app-section:app', 'dashboards');
});

it('renders the dashboard read-only while collaborator authority is still pending', async () => {
  let finish!: (value: unknown) => void;
  const pending = new Promise(resolve => { finish = resolve; });
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Fast App', owner_user_id: 'n.User.editor', workspace_id: 'ws' } } };
    if (url.includes('/collaborators')) return pending;
    return { data: { tracks: [], dashboards: [], home: null } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app?section=dashboards']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByTestId('dashboard-rights')).toHaveTextContent('read-only');
  expect(screen.queryByRole('button', { name: 'Edit app' })).not.toBeInTheDocument();
  expect(mocks.get.mock.calls.some(([url]) => url === '/tracks')).toBe(false);
  await act(async () => { finish({ data: { collaborators: [], caller_role: 'owner' } }); });
  await waitFor(() => expect(screen.getByTestId('dashboard-rights')).toHaveTextContent('editable'));
});

it('keeps readable content available when collaborator discovery fails and allows retry', async () => {
  let attempts = 0;
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Readable App', workspace_id: 'ws' } } };
    if (url.includes('/collaborators')) {
      if (++attempts === 1) throw new Error('Directory unavailable');
      return { data: { collaborators: [], caller_role: 'editor' } };
    }
    return { data: { tracks: [], dashboards: [], home: null } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app?section=dashboards']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByTestId('dashboard-rights')).toHaveTextContent('read-only');
  fireEvent.click(await screen.findByRole('button', { name: 'Retry access details' }));
  await waitFor(() => expect(screen.getByTestId('dashboard-rights')).toHaveTextContent('editable'));
  expect(mocks.get.mock.calls.filter(([url]) => url === '/apps/app')).toHaveLength(1);
});

it.each(['editor', 'commenter', 'viewer', null])('uses caller role %s when the collaborator directory is hidden', async role => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Shared app', owner_user_id: 'n.User.owner', workspace_id: 'ws' } } };
    if (url === '/apps/app/collaborators') return { data: { collaborators: [], total: 2, effective_total: 2, caller_role: role, directory_visible: false } };
    if (url === '/apps/app/tracks' || url === '/tracks') return { data: { tracks: [] } };
    if (url.includes('home')) return { data: { home: null } };
    if (url.includes('dashboards')) return { data: { dashboards: [] } };
    return { data: {} };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(screen.getByTestId('dashboard-rights').textContent).toBe(role === 'editor' ? 'editable' : 'read-only'));
  const collaborators = screen.getByRole('button', { name: 'Collaborators, 2 people' });
  expect(collaborators).toHaveTextContent('2 collaborators');
  fireEvent.click(collaborators);
  expect(screen.getByText('Collaborator details are visible to the owner and admins.')).toBeInTheDocument();
  expect(screen.queryByText('No one else has been added yet.')).not.toBeInTheDocument();
});


it('keeps Collaborators focused on people and places access details in its footer', async () => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Shared app', owner_user_id: 'n.User.owner', workspace_id: 'ws' } } };
    if (url === '/apps/app/collaborators') return { data: { collaborators: [], caller_role: 'admin', directory_visible: true } };
    if (url === '/apps/app/access') return { data: { effective_role: 'admin', links_visible: false } };
    if (url.includes('home')) return { data: { home: null } };
    return { data: { tracks: [], dashboards: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: /^Collaborators$/ }));
  expect(screen.getByRole('dialog', { name: 'Collaborators' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Manage App function access' })).not.toBeInTheDocument();
  const accessButton = screen.getByRole('button', { name: /^Access details$/ });
  expect(accessButton.parentElement).toHaveClass('sticky', 'bottom-0');
  fireEvent.click(accessButton);
  expect(await screen.findByRole('dialog', { name: 'Access details' })).toBeInTheDocument();
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/apps/app/access'));
  expect(screen.queryByRole('dialog', { name: 'Collaborators' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to collaborators' }));
  expect(await screen.findByRole('dialog', { name: 'Collaborators' })).toBeInTheDocument();
});


it('opens an explicit Home destination ahead of the remembered Dashboards tab', async () => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Shared app', workspace_id: 'ws' } } };
    if (url.includes('home')) return { data: { home: { sections: [] } } };
    if (url.includes('collaborators')) return { data: { collaborators: [], caller_role: 'viewer' } };
    return { data: { tracks: [], dashboards: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app?section=home']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByTestId('app-home')).toBeInTheDocument();
  expect(screen.queryByTestId('dashboard-rights')).not.toBeInTheDocument();
});

it.each([
  [{}, false],
  [{type:'object',properties:{}}, false],
  [{type:'object',properties:{prefix:{type:'string'}}}, true],
])('shows App settings only for configured fields (%j)', async (settings_schema, shown) => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return {data:{app:{id:'app',name:'Owned App',owner_user_id:'o.User.editor',workspace_id:'ws',settings_schema}}};
    if (url.includes('home')) return {data:{home:null}};
    return {data:{tracks:[],dashboards:[],collaborators:[],caller_role:'owner'}};
  });
  const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app']}><Routes><Route path="/apps/:appId" element={<AppDetailPage/>}/></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole('button',{name:'Edit app'});
  expect(Boolean(screen.queryByRole('button',{name:'App settings'}))).toBe(shown);
});

it.each([false, true])('retains meaningful function access without App options (historical grants: %s)', async historical => {
  mocks.workspaceRole = 'owner';
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return {data:{app:{id:'app',name:'Owned App',workspace_id:'ws',settings_schema:{}}}};
    if (url.includes('action-bindings')) return {data:{role_actions:historical?{}:{operator:['archive']},bindings:historical?[{id:'grant',active:true}]:[]}};
    if (url.includes('home')) return {data:{home:null,definition_revision:1}};
    return {data:{tracks:[],dashboards:[],collaborators:[],caller_role:'owner'}};
  });
  const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app']}><Routes><Route path="/apps/:appId" element={<AppDetailPage/>}/></Routes></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('button',{name:'App settings'})).toBeVisible();
});

it('hides App settings for an owner when there are no options, function roles or grants', async () => {
  mocks.workspaceRole = 'owner';
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return {data:{app:{id:'app',name:'Owned App',workspace_id:'ws',settings_schema:{}}}};
    if (url.includes('action-bindings')) return {data:{role_actions:{},bindings:[]}};
    if (url.includes('home')) return {data:{home:null,definition_revision:1}};
    return {data:{tracks:[],dashboards:[],collaborators:[],caller_role:'owner'}};
  });
  const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app']}><Routes><Route path="/apps/:appId" element={<AppDetailPage/>}/></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole('button',{name:'Edit app'});
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/apps/app/action-bindings',expect.anything()));
  expect(screen.queryByRole('button',{name:'App settings'})).toBeNull();
});


function HistoryControls() {
  const navigate = useNavigate();
  const location = useLocation();
  return <><button onClick={() => navigate(-1)}>Back</button><button onClick={() => navigate(1)}>Forward</button><output data-testid="location">{location.search}</output></>;
}

function mountHomePage(url = '/apps/app', home: unknown = { title: 'Home' }, denied = false) {
  mocks.get.mockImplementation(async (path: string) => {
    if (path === '/apps/app') return { data: { app: { id: 'app', name: 'Existing app', workspace_id: 'ws' } } };
    if (path.includes('/home')) {
      if (denied) throw { response: { status: 403 } };
      return { data: { home, source: 'default' } };
    }
    return { data: { tracks: [], dashboards: [], collaborators: [], caller_role: 'viewer' } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[url]}><HistoryControls /><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  return client;
}

it('defaults to exactly one Home and restores repeated tab navigation through browser history', async () => {
  localStorage.removeItem('integral:app-section:app');
  mountHomePage();
  await screen.findByTestId('app-home');
  expect(screen.getAllByRole('tab', { name: 'Home' })).toHaveLength(1);
  for (let i = 0; i < 2; i++) {
    fireEvent.click(screen.getByRole('tab', { name: /Tracks/ }));
    expect(screen.getByRole('tab', { name: /Tracks/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Home' }));
    expect(screen.getAllByTestId('app-home')).toHaveLength(1);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: /Tracks/ })).toHaveAttribute('aria-selected', 'true'));
  fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true'));
});

it.each(['home', 'tracks', 'dashboards'])('honors direct %s links over saved preference', async section => {
  mountHomePage(`/apps/app?section=${section}&keep=1`);
  await screen.findByRole('tab', { name: 'Home' });
  expect(screen.getByRole('tab', { name: new RegExp(section, 'i') })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('location')).toHaveTextContent('keep=1');
});

it.each([false, true])('falls back safely for disabled/denied Home (%s)', async denied => {
  mountHomePage('/apps/app?section=home', null, denied);
  await waitFor(() => expect(mocks.get).toHaveBeenCalledWith('/apps/app/home', expect.anything()));
  expect(screen.queryByRole('tab', { name: 'Home' })).not.toBeInTheDocument();
  expect(screen.queryByTestId('app-home')).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /Tracks/ })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByText('Start here')).not.toBeInTheDocument();
});


it('restores the initial Home after Back from the first Tracks navigation', async () => {
  localStorage.removeItem('integral:app-section:app');
  mountHomePage();
  await screen.findByTestId('app-home');
  fireEvent.click(screen.getByRole('tab', { name: /Tracks/ }));
  expect(localStorage.getItem('integral:app-section:app')).toBe('tracks');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Home' })).toHaveAttribute('aria-selected', 'true'));
  fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: /Tracks/ })).toHaveAttribute('aria-selected', 'true'));
});

function NextApp() {
  const navigate = useNavigate();
  return <button onClick={() => navigate('/apps/next?section=dashboards')}>Next App</button>;
}

it.each(['route', 'account'])('ignores a late owner response after an %s change', async transition => {
  let finishOld!: (value: unknown) => void;
  let finishNew!: (value: unknown) => void;
  const oldAccess = new Promise(resolve => { finishOld = resolve; });
  const newAccess = new Promise(resolve => { finishNew = resolve; });
  let accessCalls = 0;
  mocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/collaborators')) return ++accessCalls === 1 ? oldAccess : newAccess;
    if (url === '/apps/app' || url === '/apps/next') return { data: { app: { id: url.split('/').pop(), name: 'Shared App', workspace_id: 'ws' } } };
    return { data: { tracks: [], dashboards: [], home: null } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const page = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app?section=dashboards']}><NextApp /><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>;
  const view = render(page());
  await screen.findByTestId('dashboard-rights');
  if (transition === 'route') fireEvent.click(screen.getByText('Next App'));
  else {
    mocks.user = { id: 'n.User.other', user_id: 'o.User.other' };
    view.rerender(page());
  }
  await waitFor(() => expect(accessCalls).toBe(2));
  await act(async () => finishOld({ data: { collaborators: [], caller_role: 'owner' } }));
  expect(await screen.findByTestId('dashboard-rights')).toHaveTextContent('read-only');
  expect(screen.queryByRole('button', { name: 'Edit app' })).not.toBeInTheDocument();
  await act(async () => finishNew({ data: { collaborators: [], caller_role: 'viewer' } }));
  expect(screen.getByTestId('dashboard-rights')).toHaveTextContent('read-only');
});

it('loads linkable tracks only on demand and retries a failed picker read', async () => {
  let pickerCalls = 0;
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Shared App', workspace_id: 'ws' } } };
    if (url.endsWith('/collaborators')) return { data: { collaborators: [], caller_role: 'admin' } };
    if (url === '/tracks') {
      if (++pickerCalls === 1) throw new Error('offline');
      return { data: { tracks: [{ id: 'new-track', title: 'Available track' }] } };
    }
    return { data: { tracks: [], dashboards: [], home: null } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app?section=tracks']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole('button', { name: 'Edit app' });
  expect(pickerCalls).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Link track' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Retry tracks' }));
  expect(await screen.findByText('Available track')).toBeVisible();
  expect(pickerCalls).toBe(2);
});

it('keeps a revoked owner read-only when the current role disagrees with older App metadata', async () => {
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Transferred App', owner_user_id: 'n.User.editor', workspace_id: 'ws' } } };
    if (url.endsWith('/collaborators')) return { data: { collaborators: [], caller_role: 'viewer' } };
    return { data: { tracks: [], dashboards: [], home: null } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app?section=dashboards']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByTestId('dashboard-rights')).toHaveTextContent('read-only');
  expect(screen.queryByRole('button', { name: 'Edit app' })).not.toBeInTheDocument();
});

it.each([false, true])('withholds content after explicit access denial, including a late primary read (%s)', async primaryPending => {
  let rejectAccess!: (error: unknown) => void;
  let finishPrimary!: (value: unknown) => void;
  const access = new Promise((_resolve, reject) => { rejectAccess = reject; });
  const primary = new Promise(resolve => { finishPrimary = resolve; });
  const appData = { data: { app: { id: 'app', name: 'Private App', workspace_id: 'ws' } } };
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return primaryPending ? primary : appData;
    if (url.endsWith('/collaborators')) return access;
    return { data: { tracks: [], dashboards: [], home: null } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app?section=dashboards']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  if (!primaryPending) await screen.findByTestId('dashboard-rights');
  mocks.focus.mockClear();
  mocks.clearFocus.mockClear();
  await act(async () => rejectAccess({ response: { status: 403 } }));
  expect(await screen.findByText('This App is unavailable or you no longer have access.')).toBeVisible();
  await act(async () => finishPrimary(appData));
  expect(screen.queryByTestId('dashboard-rights')).not.toBeInTheDocument();
  expect(screen.queryByText('Private App')).not.toBeInTheDocument();
  expect(JSON.stringify(mocks.crumbs.mock.lastCall)).not.toContain('Private App');
  expect(mocks.focus).not.toHaveBeenCalled();
  expect(mocks.clearFocus).toHaveBeenCalled();
});

it('does not republish denied App metadata while retry authority remains unavailable', async () => {
  let rejectRetry!: (error: unknown) => void;
  const retryAccess = new Promise((_resolve, reject) => { rejectRetry = reject; });
  let accessCalls = 0;
  mocks.get.mockImplementation(async (url: string) => {
    if (url === '/apps/app') return { data: { app: { id: 'app', name: 'Private App', workspace_id: 'ws' } } };
    if (url.endsWith('/collaborators')) {
      if (++accessCalls === 1) throw { response: { status: 403 } };
      return retryAccess;
    }
    return { data: { tracks: [], dashboards: [], home: null } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/apps/app?section=dashboards']}><Routes><Route path="/apps/:appId" element={<AppDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole('button', { name: 'Retry App access' });
  mocks.setScope.mockClear();
  mocks.focus.mockClear();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Retry App access' })));
  await waitFor(() => expect(accessCalls).toBe(2));
  expect(JSON.stringify(mocks.crumbs.mock.lastCall)).not.toContain('Private App');
  expect(mocks.workspaceCrumbs).toHaveBeenLastCalledWith(null);
  expect(mocks.setScope).not.toHaveBeenCalled();
  expect(mocks.focus).not.toHaveBeenCalled();
  await act(async () => rejectRetry({ response: { status: 503 } }));
  expect(screen.getByText('This App is unavailable or you no longer have access.')).toBeVisible();
  expect(JSON.stringify(mocks.crumbs.mock.lastCall)).not.toContain('Private App');
  expect(mocks.setScope).not.toHaveBeenCalled();
});
