import {useEffect, useState} from 'react';
import axios from 'axios';
import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router-dom';
import {beforeEach, expect, it, vi} from 'vitest';
import {useAppUI} from '@integral/sdk-react';
import {AppReactComponentHost} from './AppReactComponentHost';
import api from '../../api/client';
import {loadReactArtifact} from './reactArtifactLoader';
import {LocalWorkspaceReconnectingError} from '../../api/localSessionError';
import {markHostSessionRecovered} from '../../api/sessionConnection';
import {ExtensionViewWidget} from '../views/ExtensionViewWidget';
const state = vi.hoisted(() => ({workspace: 'ws', principal: 'user', enabled: true}));
vi.mock('../../context/AuthContext', () => ({useAuth: () => ({user: {id: state.principal}})}));
vi.mock('../../context/ScopeContext', () => ({useScope: () => ({scope: {workspaceId: state.workspace}})}));
vi.mock('../../context/ToastContext', () => ({useToast: () => ({showToast: vi.fn()})}));
vi.mock('../../context/ConfirmContext', () => ({useConfirm: () => vi.fn().mockResolvedValue(true)}));
vi.mock('../../api/client', () => ({default: {post: vi.fn()}}));
vi.mock('../../hooks/useChangeEventInvalidation', () => ({CHANGE_EVENT_APPLIED: 'test-change'}));
vi.mock('./reactArtifactLoader', () => ({loadReactArtifact: vi.fn()}));
const digest = 'a'.repeat(64);
function Widget() {
  const ui = useAppUI();
  const [value, setValue] = useState('');
  return <><input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} /><button onClick={() => void ui.invoke('save', {}).catch(error => setValue(error.message))}>Submit</button><p>{ui.workspaceId}</p></>;
}
function shell(preview = false) {
  return <QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MemoryRouter><AppReactComponentHost appId="app" componentKey="editor" placement="track" preview={preview} fallback={<p>Legacy view</p>} /></MemoryRouter></QueryClientProvider>;
}
beforeEach(async () => {
  const moduleName = 'node:crypto';
  const {webcrypto} = await import(moduleName);
  vi.stubGlobal('crypto', webcrypto);
  state.workspace = 'ws'; state.principal = 'user'; state.enabled = true;
  vi.mocked(loadReactArtifact).mockReset().mockResolvedValue({default: Widget});
  vi.mocked(api.post).mockReset().mockImplementation(async () => ({data: {enabled: state.enabled, artifact_url: `/api/ui-artifacts/sample/${digest}/index.mjs`, component: {digest, export_name: 'default', sdk_range: '^1.0.0'}}}));
});
it('mounts only an admitted component and preserves draft state across rerenders', async () => {
  const page = render(shell());
  const input = await screen.findByLabelText('Draft');
  fireEvent.change(input, {target: {value: 'Unsaved'}});
  page.rerender(shell());
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved');
  expect(loadReactArtifact).toHaveBeenCalledTimes(1);
});
it('keeps concurrent read results valid when a matching descriptor refresh follows the first response', async () => {
  const finish: Record<string, (result: unknown) => void> = {};
  function Reader() {
    const ui = useAppUI();
    const [results, setResults] = useState<string[]>([]);
    useEffect(() => {
      for (const key of ['list_drafts', 'list_assets']) {
        void ui.invoke(key, {}).then(() => setResults(current => [...current, key]), error => setResults(current => [...current, error.message]));
      }
    }, []);
    return <p>{results.join(',')}</p>;
  }
  vi.mocked(loadReactArtifact).mockResolvedValue({default: Reader});
  const mount = vi.mocked(api.post).getMockImplementation()!;
  vi.mocked(api.post).mockImplementation((url, ...args) => {
    const key = String(url).split('/').pop()!;
    return key === 'mount' ? mount(url, ...args) : new Promise(resolve => {finish[key] = resolve;});
  });
  render(shell());
  await waitFor(() => expect(Object.keys(finish)).toHaveLength(2));
  await act(async () => {finish.list_drafts({data: {operation_class: 'read', output: {rows: []}}});});
  await waitFor(() => expect(vi.mocked(api.post).mock.calls.filter(([url]) => String(url).endsWith('/mount')).length).toBeGreaterThan(1));
  await act(async () => {finish.list_assets({data: {operation_class: 'read', output: {rows: []}}});});
  expect(await screen.findByText('list_drafts,list_assets')).toBeInTheDocument();
});
it.each(['before', 'after'] as const)('fences an old entry read that settles %s its replacement view is ready', async order => {
  let finish!: (result: unknown) => void;
  const outcome = vi.fn();
  function Reader() {
    const ui = useAppUI();
    const [result, setResult] = useState('waiting');
    useEffect(() => {
      // Observe the old request itself. Its component is deliberately unmounted
      // by the entry switch, so its error cannot be asserted in the new DOM.
      // A new request with the same intent could join it or dispatch after it
      // settles; neither ordering is the stale-mount fencing contract.
      if (ui.context?.entryId !== 'first') return;
      void ui.invoke('list_drafts', {}).then(
        () => { outcome('loaded'); setResult('loaded'); },
        error => { outcome(error); setResult(error.message); },
      );
    }, []);
    return <p>{String(ui.context?.entryId)}: {result}</p>;
  }
  vi.mocked(loadReactArtifact).mockResolvedValue({default: Reader});
  const mount = vi.mocked(api.post).getMockImplementation()!;
  vi.mocked(api.post).mockImplementation((url, ...args) => String(url).endsWith('/mount') ? mount(url, ...args) : new Promise(resolve => {finish = resolve;}));
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const page = (entryId: string) => <QueryClientProvider client={client}><MemoryRouter><AppReactComponentHost appId="app" componentKey="editor" placement="track" context={{entryId}} /></MemoryRouter></QueryClientProvider>;
  const rendered = render(page('first'));
  await waitFor(() => expect(finish).toBeDefined());
  rendered.rerender(page('second'));
  if (order === 'after') await screen.findByText('second: waiting');
  await act(async () => {finish({data: {operation_class: 'read', output: {rows: []}}});});
  await waitFor(() => expect(outcome).toHaveBeenCalledWith(expect.objectContaining({
    outcome: 'unconfirmed', message: 'Result unconfirmed. Check current records before retrying the same action.',
  })));
  expect(await screen.findByText('second: waiting')).toBeInTheDocument();
  expect(screen.queryByText('second: loaded')).not.toBeInTheDocument();
  expect(vi.mocked(api.post).mock.calls.filter(([url]) => String(url).endsWith('/operations/list_drafts'))).toHaveLength(1);
});
it('keeps a track view and its in-flight read when list entries arrive or reorder', async () => {
  let finish!: (result: unknown) => void;
  function Reader() {
    const ui = useAppUI();
    const [result, setResult] = useState('waiting');
    const [draft, setDraft] = useState('');
    useEffect(() => { void ui.invoke('list_drafts', {}).then(() => setResult('loaded'), error => setResult(error.message)); }, []);
    return <><p>{result}</p><input aria-label="Track draft" value={draft} onChange={event => setDraft(event.target.value)} /></>;
  }
  vi.mocked(loadReactArtifact).mockResolvedValue({default: Reader});
  const mount = vi.mocked(api.post).getMockImplementation()!;
  vi.mocked(api.post).mockImplementation((url, ...args) => String(url).endsWith('/mount') ? mount(url, ...args) : new Promise(resolve => {finish = resolve;}));
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const view = {id: 'review', type: 'extension_view', track_id: 'track', config: {component_key: 'editor'}} as never;
  const track = {id: 'track', app: {id: 'app'}} as never;
  const page = (ids: string[]) => <QueryClientProvider client={client}><MemoryRouter><ExtensionViewWidget view={view} track={track} viewContext="track-list" entries={ids.map(id => ({id}) as never)} isLoading={false} onEntryOpen={() => {}} /></MemoryRouter></QueryClientProvider>;
  const rendered = render(page([]));
  await waitFor(() => expect(finish).toBeDefined());
  fireEvent.change(screen.getByLabelText('Track draft'), {target: {value: 'Unsent'}});
  rendered.rerender(page(['first', 'second']));
  rendered.rerender(page(['second', 'first']));
  expect(screen.getByLabelText('Track draft')).toHaveValue('Unsent');
  await act(async () => {finish({data: {operation_class: 'read', output: {rows: []}}});});
  expect(await screen.findByText('loaded')).toBeInTheDocument();
  expect(vi.mocked(api.post).mock.calls.filter(([url]) => String(url).endsWith('/operations/list_drafts'))).toHaveLength(1);
});
it('uses the legacy view when the operator switch is disabled', async () => {
  state.enabled = false;
  render(shell());
  expect(await screen.findByText('Legacy view')).toBeInTheDocument();
  expect(loadReactArtifact).not.toHaveBeenCalled();
});
it('selects the legacy fallback for every observer of a shared disabled descriptor', async () => {
  let complete!: (value: unknown) => void;
  vi.mocked(api.post).mockImplementationOnce(() => new Promise(resolve => {complete = resolve;}));
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><MemoryRouter>
    <AppReactComponentHost appId="app" componentKey="editor" placement="track" fallback={<p>Legacy one</p>} />
    <AppReactComponentHost appId="app" componentKey="editor" placement="track" fallback={<p>Legacy two</p>} />
  </MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(complete).toBeDefined());
  await act(async () => {complete({data: {enabled: false, component: {digest, sdk_range: '^1.0.0'}}});});
  expect(await screen.findByText('Legacy one')).toBeInTheDocument();
  expect(await screen.findByText('Legacy two')).toBeInTheDocument();
});
it('does not load code after a denied descriptor', async () => {
  vi.mocked(api.post).mockRejectedValue(new Error('Denied'));
  render(shell());
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(loadReactArtifact).not.toHaveBeenCalled();
});
it('retries a failed mount after a verified host recovery without replaying operations', async () => {
  const mount = vi.mocked(api.post).getMockImplementation()!;
  vi.mocked(api.post).mockRejectedValueOnce(new LocalWorkspaceReconnectingError());
  render(shell());
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  vi.mocked(api.post).mockImplementation(mount);
  act(markHostSessionRecovered);
  expect(await screen.findByLabelText('Draft')).toBeInTheDocument();
  expect(vi.mocked(api.post).mock.calls.every(([url]) => String(url).endsWith('/mount'))).toBe(true);
});
it('retains an already mounted draft when descriptor refresh fails and the host recovers', async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const mount = vi.mocked(api.post).getMockImplementation()!;
  render(<QueryClientProvider client={client}><MemoryRouter><AppReactComponentHost appId="app" componentKey="editor" placement="track" /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('Draft'), {target: {value: 'Unsaved'}});
  vi.mocked(api.post).mockRejectedValueOnce(new LocalWorkspaceReconnectingError());
  await act(async () => { await client.invalidateQueries({queryKey: ['app-ui-component']}); });
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved');
  vi.mocked(api.post).mockImplementation(mount);
  act(markHostSessionRecovered);
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved');
  expect(vi.mocked(api.post).mock.calls.every(([url]) => String(url).endsWith('/mount'))).toBe(true);
});
it('removes an existing view on access denial and does not retry it on host recovery', async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><MemoryRouter><AppReactComponentHost appId="app" componentKey="editor" placement="track" /></MemoryRouter></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('Draft'), {target: {value: 'Private'}});
  vi.mocked(api.post).mockRejectedValueOnce(new axios.AxiosError('Forbidden', undefined, undefined, undefined, {status: 403, statusText: 'Forbidden', data: {}, headers: {}, config: {headers: new axios.AxiosHeaders()}}));
  await act(async () => { await client.invalidateQueries({queryKey: ['app-ui-component']}); });
  expect(await screen.findByRole('alert')).toHaveTextContent('unavailable');
  expect(screen.queryByLabelText('Draft')).not.toBeInTheDocument();
  const calls = vi.mocked(api.post).mock.calls.length;
  act(markHostSessionRecovered);
  expect(vi.mocked(api.post)).toHaveBeenCalledTimes(calls);
});
it('blocks a retained view from invoking operations while its mount is interrupted', async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  render(<QueryClientProvider client={client}><MemoryRouter><AppReactComponentHost appId="app" componentKey="editor" placement="track" /></MemoryRouter></QueryClientProvider>);
  await screen.findByLabelText('Draft');
  vi.mocked(api.post).mockRejectedValueOnce(new LocalWorkspaceReconnectingError());
  await act(async () => { await client.invalidateQueries({queryKey: ['app-ui-component']}); });
  await screen.findByRole('alert');
  fireEvent.click(screen.getByText('Submit'));
  await waitFor(() => expect(screen.getByLabelText('Draft')).toHaveValue('Business actions are disabled.'));
  expect(vi.mocked(api.post).mock.calls.every(([url]) => String(url).endsWith('/mount'))).toBe(true);
});
it('recovers when verification completes before an interrupted mount settles', async () => {
  const mount = vi.mocked(api.post).getMockImplementation()!;
  let rejectMount!: (error: Error) => void;
  vi.mocked(api.post).mockImplementationOnce(() => new Promise((_resolve, reject) => {rejectMount = reject;}));
  render(shell());
  await waitFor(() => expect(rejectMount).toBeDefined());
  act(markHostSessionRecovered);
  vi.mocked(api.post).mockImplementation(mount);
  await act(async () => { rejectMount(new LocalWorkspaceReconnectingError()); });
  expect(await screen.findByLabelText('Draft')).toBeInTheDocument();
  expect(vi.mocked(api.post)).toHaveBeenCalledTimes(2);
});
it('recovers a shared interrupted mount when its initiating observer unmounts after recovery', async () => {
  const mount = vi.mocked(api.post).getMockImplementation()!;
  let rejectMount!: (error: Error) => void;
  vi.mocked(api.post).mockImplementationOnce(() => new Promise((_resolve, reject) => {rejectMount = reject;}));
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  const page = (first: boolean, second: boolean) => <QueryClientProvider client={client}><MemoryRouter>
    {first && <AppReactComponentHost key="first" appId="app" componentKey="editor" placement="track" />}
    {second && <AppReactComponentHost key="second" appId="app" componentKey="editor" placement="track" />}
  </MemoryRouter></QueryClientProvider>;
  const rendered = render(page(true, false));
  await waitFor(() => expect(rejectMount).toBeDefined());
  act(markHostSessionRecovered);
  rendered.rerender(page(true, true));
  rendered.rerender(page(false, true));
  vi.mocked(api.post).mockImplementation(mount);
  await act(async () => {rejectMount(new LocalWorkspaceReconnectingError());});
  expect(await screen.findByLabelText('Draft')).toBeInTheDocument();
  expect(vi.mocked(api.post)).toHaveBeenCalledTimes(2);
});
it('blocks preview writes before HTTP dispatch', async () => {
  render(shell(true));
  fireEvent.click(await screen.findByText('Submit'));
  await waitFor(() => expect(screen.getByLabelText('Draft')).toHaveValue('Business actions are disabled.'));
  expect(vi.mocked(api.post).mock.calls.every(([url]) => String(url).endsWith('/mount'))).toBe(true);
});
it('replaces component state on a workspace or principal switch', async () => {
  const page = render(shell());
  fireEvent.change(await screen.findByLabelText('Draft'), {target: {value: 'Private draft'}});
  state.workspace = 'other';
  page.rerender(shell());
  await waitFor(() => expect(screen.getByLabelText('Draft')).toHaveValue(''));
  expect(screen.getByText('other')).toBeInTheDocument();
  const calls = vi.mocked(api.post).mock.calls;
  expect(calls.some(([, , config]) => (config?.headers as Record<string, string>)?.['X-Integral-Scope'] === 'ws:other')).toBe(true);
});
it('does not populate the next workspace with a delayed old query', async () => {
  let resolve!: (value: unknown) => void;
  function Reader() {
    const ui = useAppUI(); const [text, setText] = useState('waiting');
    useEffect(() => {
      const controller = new AbortController();
      ui.query('records', {}, controller.signal).then(value => setText(String(value.title))).catch(() => undefined);
      return () => controller.abort();
    }, [ui.query]);
    return <p>{text}</p>;
  }
  vi.mocked(loadReactArtifact).mockResolvedValue({default: Reader});
  const mount = vi.mocked(api.post).getMockImplementation()!;
  vi.mocked(api.post).mockImplementation((url, ...args) => String(url).endsWith('/queries/records') ? new Promise(done => {resolve = done;}) : mount(url, ...args));
  const page = render(shell());
  await screen.findByText('waiting');
  state.workspace = 'other'; page.rerender(shell());
  await act(async () => {resolve({data: {title: 'Old private data'}});});
  expect(screen.queryByText('Old private data')).not.toBeInTheDocument();
});
it('keeps the legacy draft mounted until an enabled native view is explicitly accepted', async () => {
  state.enabled = false;
  render(shell());
  const legacy = await screen.findByText('Legacy view');
  state.enabled = true;
  act(() => window.dispatchEvent(new Event('test-change')));
  await screen.findByText('A newer view is available.');
  expect(screen.getByText('Legacy view')).toBe(legacy);
  expect(loadReactArtifact).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', {name: 'Reload view'}));
  await screen.findByLabelText('Draft');
  expect(screen.queryByText('Legacy view')).not.toBeInTheDocument();
  expect(loadReactArtifact).toHaveBeenCalledTimes(1);
});

it('defers host-owned field data until the operator selects the fallback', async () => {
  let complete!: (value: any) => void;
  vi.mocked(api.post).mockImplementation(() => new Promise(resolve => {complete = resolve;}));
  const owner = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><AppReactComponentHost appId="app" componentKey="editor" placement="entry_compose" onFieldDataOwnerChange={owner} fallback={<p>Legacy form</p>} /></MemoryRouter></QueryClientProvider>);
  expect(owner).not.toHaveBeenCalled();
  await act(async () => {complete({data: {enabled: false, component: {digest, sdk_range: '^1.1.0'}}});});
  await screen.findByText('Legacy form');
  expect(owner).toHaveBeenLastCalledWith('host');
  expect(loadReactArtifact).not.toHaveBeenCalled();
});
