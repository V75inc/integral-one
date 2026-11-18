import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { EntryInlineFields, canInlineEditField } from '../EntryInlineFields';
import { entriesApi } from '../../../api';
import type { Entry, OperationalModelFieldSpec, User } from '../../../types';

vi.mock('../../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws-inline' } }),
}));
vi.mock('../../../api', () => ({ entriesApi: { get: vi.fn(), update: vi.fn() }, tracksApi: {} }));
vi.mock('../../../api/members', () => ({
  lookupWorkspaceMemberById: vi.fn(async (id: string) => ({ id, display_name: 'Alex' })),
}));
vi.mock('../../collab/UserSearchPicker', () => ({
  UserSearchPicker: ({ pool, onSelect }: { pool: string; onSelect: (user: User) => void }) => (
    <button type="button" onClick={() => { expect(pool).toBe('workspace'); onSelect({ id: 'n.User.alex', display_name: 'Alex' } as User); }}>Pick Alex</button>
  ),
}));

const text: OperationalModelFieldSpec = { key: 'summary', name: 'Summary', type: 'text' };
const assignee: OperationalModelFieldSpec = { key: 'assignee', name: 'Assignee', type: 'member', hide_when_empty: true };
const original = { id: 'entry-a', track_id: 'track-a', title: 'Synthetic entry',
  record_revision: 7, schema_revision: 3, custom_fields: { summary: 'Original', assignee: null },
} as unknown as Entry;
const get = vi.mocked(entriesApi.get), update = vi.mocked(entriesApi.update);
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  let server = structuredClone(original);
  get.mockImplementation(async () => server);
  update.mockImplementation(async (_id, payload) => {
    server = { ...server, record_revision: (server.record_revision ?? 1) + 1,
      custom_fields: { ...server.custom_fields, ...(payload.custom_fields as object) } };
    return server;
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup(overrides: Partial<React.ComponentProps<typeof EntryInlineFields>> = {}) {
  const onSaved = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let props = { entry: original, fields: [text, assignee], values: original.custom_fields ?? {},
    variant: 'detail' as const, onSaved, ...overrides };
  const tree = () => <StrictMode><MemoryRouter><QueryClientProvider client={client}>
    <EntryInlineFields {...props} />
  </QueryClientProvider></MemoryRouter></StrictMode>;
  const view = render(tree());
  return { onSaved, client, ...view,
    change: (changes: Partial<typeof props>) => { props = { ...props, ...changes }; view.rerender(tree()); } };
}

async function open(name = 'Summary') {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${name}` }));
  return screen.findByRole('group', { name: `Edit ${name}` });
}

describe('explicit entry field editing', () => {
  it('keeps read mode static and never writes on hover, blur, Enter or cancel', async () => {
    setup();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.mouseOver(screen.getByText('Original'));
    expect(get).not.toHaveBeenCalled();
    const group = await open();
    const input = within(group).getByRole('textbox', { name: 'Summary' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: 'Draft' } });
    fireEvent.keyDown(input, { key: 'Enter' }); fireEvent.blur(input);
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Original')).toBeVisible();
    expect(update).not.toHaveBeenCalled();
  });

  it('uses the scoped member picker and saves only the chosen field with observed revisions', async () => {
    const f = setup();
    const group = await open('Assignee');
    fireEvent.click(within(group).getByRole('button', { name: 'Assignee' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pick Alex' }));
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('entry-a', {
      custom_fields: { assignee: 'n.User.alex' }, expected_record_revision: 7, expected_schema_revision: 3,
    }));
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Edit Assignee' })).toBeNull());
    expect(f.onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ record_revision: 8 }));
  });

  it('loads authoritative values and revisions before opening an old list payload', async () => {
    get.mockResolvedValue({ ...original, record_revision: 12, schema_revision: 5,
      custom_fields: { summary: 'Current server value' } });
    setup({ entry: { ...original, record_revision: undefined, schema_revision: undefined } });
    const group = await open();
    expect(within(group).getByRole('textbox')).toHaveValue('Current server value');
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('entry-a', expect.objectContaining({
      expected_record_revision: 12, expected_schema_revision: 5,
    })));
  });

  it.each([403, 409, 422, 500])('retains the draft and exposes the server error on HTTP %i', async status => {
    update.mockRejectedValue({ response: { status, data: { message: 'Synthetic API refusal' } } });
    setup(); const group = await open();
    fireEvent.change(within(group).getByRole('textbox'), { target: { value: 'Keep my draft' } });
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(within(group).getByRole('textbox')).toHaveValue('Keep my draft');
    fireEvent.click(within(alert).getByText('Show error details'));
    expect(within(alert).getByText('Synthetic API refusal')).toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('fetches a fresh version after a cancelled conflict instead of silently rebasing the draft', async () => {
    update.mockRejectedValueOnce({ response: { status: 409, data: { message: 'Record changed' } } });
    setup(); let group = await open();
    fireEvent.change(within(group).getByRole('textbox'), { target: { value: 'Stale draft' } });
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await screen.findByRole('alert');
    expect(update.mock.calls[0][1]).toMatchObject({ expected_record_revision: 7 });
    fireEvent.click(within(group).getByRole('button', { name: 'Cancel' }));
    get.mockResolvedValue({ ...original, record_revision: 8, custom_fields: { summary: 'Someone else saved' } });
    group = await open();
    expect(within(group).getByRole('textbox')).toHaveValue('Someone else saved');
  });

  it('does not adopt a newer list revision underneath an already opened draft', async () => {
    const f = setup(); const group = await open();
    fireEvent.change(within(group).getByRole('textbox'), { target: { value: 'My draft' } });
    f.change({ entry: { ...original, record_revision: 9, schema_revision: 4 }, values: { summary: 'External update' } });
    expect(within(group).getByRole('textbox')).toHaveValue('My draft');
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('entry-a', {
      custom_fields: { summary: 'My draft' }, expected_record_revision: 7, expected_schema_revision: 3,
    }));
  });

  it('can retry a refused save without losing the draft or silently changing the revision', async () => {
    update.mockRejectedValueOnce({ response: { status: 500, data: { message: 'Try again' } } });
    setup(); const group = await open();
    fireEvent.change(within(group).getByRole('textbox'), { target: { value: 'Retain draft' } });
    fireEvent.click(within(group).getByRole('button', { name: 'Save' })); await screen.findByRole('alert');
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1]).toEqual(update.mock.calls[0]);
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Edit Summary' })).toBeNull());
  });

  it('rehydrates backlinks and live-field projections after the partial write response', async () => {
    const before = { ...original, anchor_source: { id: 'parent', title: 'Parent', track_id: 'parent-track', track_title: 'Parent track', field_key: 'linked_records' },
      read_time_fields: { values: { score: 7 }, status: { score: 'available' } } } as Entry;
    const saved = { ...original, record_revision: 8, custom_fields: { ...original.custom_fields, summary: 'New' } };
    const complete = { ...before, ...saved, read_time_fields: { values: { score: 9 }, status: { score: 'available' } } };
    get.mockResolvedValueOnce(before).mockResolvedValueOnce(complete); update.mockResolvedValue(saved);
    const f = setup({ entry: before, fields: [text, { key: 'score', name: 'Score', type: 'number' }], values: { summary: 'Original', score: 7 } });
    expect(screen.queryByRole('button', { name: 'Edit Score' })).toBeNull();
    const group = await open(); fireEvent.change(within(group).getByRole('textbox'), { target: { value: 'New' } });
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(f.onSaved).toHaveBeenLastCalledWith(complete));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('distinguishes a committed save from refresh failure, protects unknown projections and never replays the write', async () => {
    const before = { ...original, anchor_source: { id: 'parent', title: 'Parent', track_id: 'parent-track', track_title: 'Parent track', field_key: 'linked_records' },
      read_time_fields: { values: { score: 7 }, status: { score: 'available' } } } as Entry;
    const saved = { ...original, record_revision: 8 };
    const complete = { ...before, ...saved };
    get.mockResolvedValueOnce(before).mockRejectedValueOnce({ response: { status: 503, data: { message: 'Synthetic read refusal' } } }).mockResolvedValueOnce(complete);
    update.mockResolvedValue(saved);
    const f = setup({ entry: before }); const group = await open();
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    await screen.findByText('Field saved. Refresh the entry to check its latest live fields.');
    expect(f.onSaved).toHaveBeenLastCalledWith(expect.objectContaining({ record_revision: 8,
      anchor_source: before.anchor_source,
      read_time_fields: { values: { score: null }, status: { score: 'unavailable' } },
    }));
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh entry' }));
    await waitFor(() => expect(f.onSaved).toHaveBeenLastCalledWith(complete));
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('coalesces repeated save clicks and does not change other fields or permit edits during a save', async () => {
    const pending = deferred<Entry>(); update.mockReturnValue(pending.promise);
    const f = setup(); const invalidate = vi.spyOn(f.client, 'invalidateQueries');
    const group = await open(); const save = within(group).getByRole('button', { name: 'Save' });
    fireEvent.click(save); fireEvent.click(save);
    expect(update).toHaveBeenCalledTimes(1);
    expect(within(group).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit Assignee' })).toBeDisabled();
    expect(within(group).getByRole('textbox')).toBeDisabled();
    await act(async () => pending.resolve({ ...original, record_revision: 8 }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['entry', 'entry-a'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['feed'] });
  });

  it('does not let a late save or load change a different record after navigation', async () => {
    const pending = deferred<Entry>(); update.mockReturnValue(pending.promise);
    const f = setup(); const group = await open(); f.onSaved.mockClear();
    fireEvent.click(within(group).getByRole('button', { name: 'Save' }));
    f.change({ entry: { ...original, id: 'entry-b' }, values: { summary: 'Other record' } });
    await act(async () => pending.resolve({ ...original, record_revision: 8 }));
    expect(f.onSaved).not.toHaveBeenCalled(); expect(screen.getByText('Other record')).toBeVisible();
    const load = deferred<Entry>(); get.mockReturnValue(load.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Summary' }));
    f.change({ entry: { ...original, id: 'entry-c' }, values: { summary: 'Third record' } });
    await act(async () => load.resolve({ ...original, id: 'entry-b' }));
    expect(f.onSaved).not.toHaveBeenCalled(); expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('removes the edit controls if permission is withdrawn, including before an in-flight load completes', async () => {
    const load = deferred<Entry>(); get.mockReturnValue(load.promise);
    const f = setup(); fireEvent.click(screen.getByRole('button', { name: 'Edit Summary' }));
    f.change({ readOnly: true });
    await act(async () => load.resolve(original));
    expect(screen.queryByRole('textbox')).toBeNull(); expect(f.onSaved).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Edit Summary' })).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('cancels an open field if its schema or readonly condition removes write authority', async () => {
    const f = setup(); await open();
    f.change({ fields: [{ ...text, readonly: true }, assignee] });
    expect(screen.queryByRole('textbox')).toBeNull(); expect(update).not.toHaveBeenCalled();
  });

  it('Escape cancels the field and does not close its containing entry', async () => {
    const onEscape = vi.fn(); document.addEventListener('keydown', onEscape);
    try {
      setup(); const group = await open(); fireEvent.keyDown(within(group).getByRole('textbox'), { key: 'Escape' });
      expect(screen.queryByRole('textbox')).toBeNull(); expect(onEscape).not.toHaveBeenCalled();
    } finally { document.removeEventListener('keydown', onEscape); }
  });

  it('refuses an editor if the API cannot supply bound revisions', async () => {
    get.mockResolvedValue({ ...original, record_revision: undefined });
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Edit Summary' }));
    await screen.findByRole('alert'); expect(screen.queryByRole('textbox')).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps viewers, projected fields, conditional locks and complex write workflows read-only', () => {
    const fields = [text, { ...assignee, readonly: true },
      { key: 'due', name: 'Due', type: 'date', readonly_if: { field: 'status', equals: 'closed' } },
      { key: 'score', name: 'Score', type: 'number' },
      { key: 'links', name: 'Links', type: 'relation' },
    ] as OperationalModelFieldSpec[];
    const values = { summary: 'Original', status: 'closed', score: 9 };
    const f = setup({ fields, values, readOnlyKeys: ['score'] });
    expect(screen.getAllByRole('button', { name: /^Edit / })).toHaveLength(1);
    f.change({ readOnly: true }); expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
    expect(canInlineEditField({ ...text, key: '_private' }, values, [])).toBe(false);
    expect(canInlineEditField({ ...text, hidden: true }, values, [])).toBe(false);
    expect(canInlineEditField({ ...text, type: 'computed' }, values, [])).toBe(false);
  });
});
