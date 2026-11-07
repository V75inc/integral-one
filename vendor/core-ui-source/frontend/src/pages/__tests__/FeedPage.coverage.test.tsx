import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FeedPage } from '../FeedPage';
import { feedApi } from '../../api/feed';
import { retrieve } from '../../api/retrieve';
import type { Entry } from '../../types';

const mocks = vi.hoisted(() => ({
  context: { setPageContext: vi.fn(), clearPageContext: vi.fn() },
  toast: { showToast: vi.fn() },
  user: { id: 'user-one' },
  scope: { workspaceId: 'workspace-one' },
}));
vi.mock('../../api', () => ({
  appsApi: { list: vi.fn().mockResolvedValue([]), listTracks: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue({ id: "installed-app", name: "Installed App" }) },
  tracksApi: { list: vi.fn().mockResolvedValue([]) },
  tagsApi: { list: vi.fn().mockResolvedValue([]) },
  entriesApi: {},
}));
vi.mock('../../api/feed', () => ({ feedApi: { getEntriesPage: vi.fn() } }));
vi.mock('../../api/retrieve', () => ({ retrieve: vi.fn() }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('../../context/ScopeContext', () => ({ useScope: () => ({ scope: mocks.scope }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => mocks.toast }));
vi.mock('../../context/CrumbsContext', () => ({ useSetCrumbs: () => {} }));
vi.mock('../../context/ChatPageFocusContext', () => ({ useChatPageFocus: () => mocks.context }));
vi.mock('../../context/AssistantDockContext', () => ({ useAssistantDockOptional: () => null }));
vi.mock('../../features/settings/store', () => ({ useSettings: () => [{ retrieval: { mode: 'hybrid' } }] }));
vi.mock('../../components/entries/EntryCard', () => ({ EntryCard: ({ entry }: { entry: Entry }) => <h3>{entry.title}</h3> }));
vi.mock('../../components/entries/EntryDetail', () => ({ EntryDetail: () => null }));

const ordinary = { id: 'ordinary-entry', track_id: 'ordinary-track', title: 'Ordinary note', type: 'note' } as Entry;
const emptyPage = { entries: [], nextCursor: null, hasMore: false };

function mount(path = "/feed") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><FeedPage /></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(feedApi.getEntriesPage).mockResolvedValue(emptyPage);
  vi.mocked(retrieve).mockResolvedValue({ results: [], mode: 'hybrid', requested_mode: 'hybrid',
    degraded: false, dropped_for_permission: 0, candidates_examined: 0 });
  vi.stubGlobal('IntersectionObserver', class {
    observe() {}
    disconnect() {}
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('Feed read coverage', () => {
  it('replaces a false empty workspace with the server-reported App coverage', async () => {
    vi.mocked(feedApi.getEntriesPage).mockResolvedValue({ ...emptyPage, total: 0, appQueryRequired: true });
    mount();
    expect(await screen.findByRole('status', { name: 'App record coverage' })).toBeVisible();
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
    expect(screen.getByText('0 entries shown')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Apps' })).toHaveAttribute('href', '/apps');
  });

  it('shows ordinary rows alongside partial coverage and labels their displayed count', async () => {
    vi.mocked(feedApi.getEntriesPage).mockResolvedValue({ ...emptyPage, entries: [ordinary], total: 9, appQueryRequired: true });
    mount();
    expect(await screen.findByRole('heading', { name: 'Ordinary note' })).toBeVisible();
    expect(screen.getByRole('status', { name: 'App record coverage' })).toBeVisible();
    expect(screen.getByText('1 entry shown')).toBeVisible();
    expect(screen.queryByText('9 entries')).not.toBeInTheDocument();
  });

  it('allows paging beyond an excluded first page without an automatic retry loop', async () => {
    vi.mocked(feedApi.getEntriesPage)
      .mockResolvedValueOnce({ entries: [], nextCursor: 'next-page', hasMore: true, appQueryRequired: true })
      .mockResolvedValueOnce({ ...emptyPage, entries: [ordinary] });
    mount();
    const more = await screen.findByRole('button', { name: 'Load more entries' });
    expect(feedApi.getEntriesPage).toHaveBeenCalledTimes(1);
    fireEvent.click(more);
    expect(await screen.findByRole('heading', { name: 'Ordinary note' })).toBeVisible();
    expect(feedApi.getEntriesPage).toHaveBeenCalledTimes(2);
    expect(feedApi.getEntriesPage).toHaveBeenLastCalledWith({ include_total: false, cursor: 'next-page' });
    expect(screen.queryByRole('button', { name: 'Load more entries' })).not.toBeInTheDocument();
  });

  it('retains the normal empty state when there is no read restriction', async () => {
    mount();
    expect(await screen.findByText('Nothing here yet')).toBeVisible();
    expect(screen.queryByRole('status', { name: 'App record coverage' })).not.toBeInTheDocument();
  });

  it.each([true, false])('honors coverage from a submitted search: App restriction = %s', async appRestricted => {
    vi.mocked(retrieve).mockResolvedValue({ results: [], mode: 'hybrid', requested_mode: 'hybrid',
      degraded: false, dropped_for_permission: 0, candidates_examined: 1,
      boundary: appRestricted ? { declared_query_required: true } : null });
    mount();
    await screen.findByText('Nothing here yet');
    const input = screen.getByPlaceholderText('Search across the workspace');
    fireEvent.change(input, { target: { value: 'receipt' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(retrieve).toHaveBeenCalledTimes(1));
    if (appRestricted) {
      expect(await screen.findByRole('status', { name: 'App record coverage' })).toHaveTextContent('This search does not include records managed inside Apps');
      expect(screen.queryByText('No matches')).not.toBeInTheDocument();
    } else {
      expect(await screen.findByText('No matches')).toBeVisible();
      expect(screen.queryByRole('status', { name: 'App record coverage' })).not.toBeInTheDocument();
    }
  });
});


it('ranks within the selected App before hydrating matching records', async () => {
  mount('/feed?app=installed-app');
  await screen.findByText('Nothing here yet');
  const input = screen.getByPlaceholderText('Search across the workspace');
  fireEvent.change(input, { target: { value: 'designer' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() => expect(retrieve).toHaveBeenCalledWith(
    expect.objectContaining({ query: 'designer', scope: 'app:installed-app' }),
  ));
});

it('displays installed-App search hits after ranked hydration', async () => {
  vi.mocked(feedApi.getEntriesPage).mockImplementation(async params => (
    params?.entry_ids ? { ...emptyPage, entries: [{ ...ordinary, title: 'App designer' }] } : emptyPage
  ));
  vi.mocked(retrieve).mockResolvedValue({
    results: [{ entry_id: ordinary.id, track_id: ordinary.track_id, score: 1, mode_origin: ['lexical'] }],
    mode: 'hybrid', requested_mode: 'hybrid', degraded: false,
    dropped_for_permission: 0, candidates_examined: 1,
  });
  mount('/feed?app=installed-app');
  await screen.findByText('Nothing here yet');
  const input = screen.getByPlaceholderText('Search across the workspace');
  fireEvent.change(input, { target: { value: 'designer' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(await screen.findByRole('heading', { name: 'App designer' })).toBeVisible();
  expect(feedApi.getEntriesPage).toHaveBeenCalledWith(expect.objectContaining({
    app_id: 'installed-app', entry_ids: ordinary.id,
  }));
  expect(screen.queryByRole('status', { name: 'App record coverage' })).not.toBeInTheDocument();
});
