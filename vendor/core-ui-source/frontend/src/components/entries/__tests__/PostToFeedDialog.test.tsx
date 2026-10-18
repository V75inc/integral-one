import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { feedPostTracks, PostToFeedDialog } from '../PostToFeedDialog';
import type { FormDialogProps } from '../../../templates/FormDialog';
import type { AppSelectProps } from '../../ui/AppSelect';
import { appsApi, entriesApi, entryTypesApi, tracksApi } from '../../../api';
import type { App, Entry, EntryTypeNode, Track } from '../../../types';

vi.mock('../../../api', () => ({ appsApi: { list: vi.fn() }, tracksApi: { list: vi.fn() }, entriesApi: { create: vi.fn() }, entryTypesApi: { list: vi.fn() } }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u' } }) }));
vi.mock('../../../context/ScopeContext', () => ({ useScope: () => ({ scope: { workspaceId: 'ws' } }) }));
vi.mock('../../../context/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('../../../templates', () => ({ FormDialog: ({ open, children, onSubmit, submitDisabled }: FormDialogProps) => open ? <form onSubmit={e => { e.preventDefault(); onSubmit?.(e); }}>{children}<button disabled={submitDisabled}>Post to feed</button></form> : null }));
vi.mock('../../ui', () => ({ AppSelect: ({ id, value, onValueChange, options }: AppSelectProps) => <select id={id} value={value} onChange={e => onValueChange(e.target.value)}><option value="">Choose a track</option>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select> }));

const source = { id: 'source', title: 'Original title', body: 'PRIVATE CONTENT', attachment_ids: ['private-file'] } as Entry;
const makeTrack = (id: string, extra: Partial<Track> = {}) => ({ id, title: id, caller_role: 'editor', ...extra }) as Track;

describe('PostToFeedDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(appsApi.list).mockResolvedValue([]);
    vi.mocked(tracksApi.list).mockResolvedValue([makeTrack('general')]);
    vi.mocked(entryTypesApi.list).mockResolvedValue([{ id: 'post-type', name: 'post' }] as EntryTypeNode[]);
    vi.mocked(entriesApi.create).mockResolvedValue({ id: 'post' } as Entry);
  });
  it('excludes domain, unknown, unavailable, hidden and read-only destinations', () => {
    const apps = [{ id: 'open' }, { id: 'domain', installed_package_slug: 'some-app' }, { id: 'paused', lifecycle_state: 'paused' }] as App[];
    const tracks = [makeTrack('general'), makeTrack('open', { app: apps[0] }), makeTrack('domain', { app: apps[1] }), makeTrack('paused', { app: apps[2] }), makeTrack('unknown', { app: { id: 'unknown' } as App }), makeTrack('hidden', { nav_visible: false }), makeTrack('viewer', { caller_role: 'viewer' })];
    expect(feedPostTracks(tracks, apps, { id: 'u' }).map(t => t.id)).toEqual(['general', 'open']);
  });
  function setup() {
    const onClose = vi.fn();
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PostToFeedDialog open entry={source} onClose={onClose} /></QueryClientProvider>);
    return onClose;
  }
  it('publishes reviewed text and a link without copying content or attachments', async () => {
    const onClose = setup();
    await screen.findByRole('option', { name: 'general' });
    fireEvent.change(screen.getByLabelText('Destination track'), { target: { value: 'general' } });
    fireEvent.change(screen.getByLabelText('Post title'), { target: { value: 'Announcement' } });
    fireEvent.change(screen.getByLabelText('Message (optional)'), { target: { value: 'Please review' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Post to feed' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Post to feed' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(entriesApi.create).toHaveBeenCalledWith({ track_id: 'general', type_id: 'post-type', type: 'post', title: 'Announcement', body: 'Please review\n\n[Open original entry](/entries/source)' });
  });
  it('preserves the draft and stays open on failure', async () => {
    vi.mocked(entriesApi.create).mockRejectedValue(new Error('offline'));
    const onClose = setup();
    await screen.findByRole('option', { name: 'general' });
    fireEvent.change(screen.getByLabelText('Destination track'), { target: { value: 'general' } });
    fireEvent.change(screen.getByLabelText('Message (optional)'), { target: { value: 'Keep my draft' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Post to feed' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Post to feed' }));
    await screen.findByRole('alert');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Message (optional)')).toHaveValue('Keep my draft');
  });
  it('does not create an entry type to force a destination to accept posts', async () => {
    vi.mocked(entryTypesApi.list).mockResolvedValue([]);
    setup();
    await screen.findByRole('option', { name: 'general' });
    fireEvent.change(screen.getByLabelText('Destination track'), { target: { value: 'general' } });
    await screen.findByText('This track has no Post entry type. Choose another track.');
    expect(screen.getByRole('button', { name: 'Post to feed' })).toBeDisabled();
    expect(entriesApi.create).not.toHaveBeenCalled();
  });
});
