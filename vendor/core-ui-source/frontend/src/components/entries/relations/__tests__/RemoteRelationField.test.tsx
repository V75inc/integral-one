import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteRelationField } from '../RemoteRelationField';
import type { SeamlessFieldProps } from '../../SeamlessField';

const { get, identity } = vi.hoisted(() => ({ get: vi.fn(), identity: { workspace: 'ws-a', principal: 'user-a' } }));
vi.mock('../../../../api/client', () => ({ default: { get } }));
vi.mock('../../../../context/AuthContext', () => ({ useAuthOptional: () => ({ user: { id: identity.principal } }) }));
vi.mock('../../../../context/ScopeContext', () => ({ useScopeOptional: () => ({ scope: { workspaceId: identity.workspace } }) }));

function field(overrides: Partial<SeamlessFieldProps> = {}): SeamlessFieldProps {
  return { field: { key: 'related', name: 'Related', type: 'relation' }, value: '', onChange: vi.fn(),
    relationSource: { trackId: 'track', entryTypeId: 'type' }, ...overrides };
}
function control(props: SeamlessFieldProps) {
  return <div><button onClick={() => props.onRelationOpen?.(true)}>Open</button>
    <input aria-label="Search" onChange={event => props.onRelationSearch?.(event.target.value)} />
    <span>{props.relationLoading ? 'Waiting' : 'Ready'}</span>
    {props.relationChoices?.map(option => <span key={option.value}>{option.label}</span>)}
    {props.relationFooter}
  </div>;
}
function setup(props = field(), copies = 1) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = (value: SeamlessFieldProps) => <QueryClientProvider client={client}>
    {Array.from({ length: copies }, (_, i) => <RemoteRelationField key={i} props={value} render={control} />)}
  </QueryClientProvider>;
  const mounted = render(content(props));
  return { ...mounted, client, replace: (value: SeamlessFieldProps) => mounted.rerender(content(value)) };
}
const page = (id = 'one', next: string | null = null) => ({ data: {
  options: [{ id, label: id, track_id: 'track', track_title: 'Records' }], next_cursor: next, has_more: Boolean(next),
} });

beforeEach(() => { vi.clearAllMocks(); identity.workspace = 'ws-a'; identity.principal = 'user-a'; get.mockResolvedValue(page()); });
describe('independent remote relation choices', () => {
  it('coalesces opening and immediate typing into one debounced request', async () => {
    setup();
    fireEvent.click(screen.getByText('Open'));
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Customer beyond the first page' } });
    expect(get).not.toHaveBeenCalled();
    await screen.findByText('one (Records)');
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0][1].params.q).toBe('Customer beyond the first page');
  });
  it('makes one field usable while another field is still waiting', async () => {
    get.mockImplementation((_url, config) => config.params.field_key === 'slow'
      ? new Promise(() => {}) : Promise.resolve(page('usable')));
    const client = new QueryClient();
    render(<QueryClientProvider client={client}>
      <RemoteRelationField props={field({ field: { key: 'slow', name: 'Slow', type: 'relation' } })} render={control} />
      <RemoteRelationField props={field({ field: { key: 'fast', name: 'Fast', type: 'relation' } })} render={control} />
    </QueryClientProvider>);
    screen.getAllByText('Open').forEach(button => fireEvent.click(button));
    await screen.findByText('usable (Records)');
    expect(screen.getAllByText('Waiting')).toHaveLength(1);
    expect(get).toHaveBeenCalledTimes(2);
  });
  it('loads on demand and shares identical concurrent requests', async () => {
    setup(field(), 2);
    expect(get).not.toHaveBeenCalled();
    screen.getAllByText('Open').forEach(button => fireEvent.click(button));
    await waitFor(() => expect(screen.getAllByText('one (Records)')).toHaveLength(2));
    expect(get).toHaveBeenCalledTimes(1);
  });
  it('debounces search and pages beyond the initial result', async () => {
    get.mockResolvedValueOnce(page('first', 'cursor')).mockResolvedValueOnce(page('second')).mockResolvedValueOnce(page('search'));
    setup();
    fireEvent.click(screen.getByText('Open'));
    await screen.findByText('first (Records)');
    fireEvent.click(screen.getByText('Load more'));
    await screen.findByText('second (Records)');
    expect(get.mock.calls[1][1].params.cursor).toBe('cursor');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'outside 200' } });
    expect(get).toHaveBeenCalledTimes(2);
    await screen.findByText('search (Records)');
    expect(get.mock.calls[2][1].params.q).toBe('outside 200');
  });
  it('shows failures and allows an explicit retry', async () => {
    get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page());
    setup(); fireEvent.click(screen.getByText('Open'));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByText('Retry'));
    await screen.findByText('one (Records)');
  });
  it('cancels obsolete requests when source changes', async () => {
    let signal: AbortSignal;
    get.mockImplementationOnce((_url, config) => {
      signal = config.signal;
      return new Promise(() => {});
    });
    const mounted = setup(); fireEvent.click(screen.getByText('Open'));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    mounted.replace(field({ relationSource: { trackId: 'other', entryTypeId: 'type' } }));
    await waitFor(() => expect(signal.aborted).toBe(true));
    await screen.findByText('one (Records)');
  });
  it('never reuses another workspace cache', async () => {
    const mounted = setup(); fireEvent.click(screen.getByText('Open'));
    await screen.findByText('one (Records)');
    identity.workspace = 'ws-b'; get.mockResolvedValue(page('two'));
    mounted.replace(field());
    await screen.findByText('two (Records)');
    expect(screen.queryByText('one (Records)')).toBeNull();
  });
  it('never reuses another principal cache', async () => {
    const mounted = setup(); fireEvent.click(screen.getByText('Open'));
    await screen.findByText('one (Records)');
    identity.principal = 'user-b'; get.mockResolvedValue(page('two'));
    mounted.replace(field());
    await screen.findByText('two (Records)');
    expect(screen.queryByText('one (Records)')).toBeNull();
  });
  it('refreshes after related records change', async () => {
    setup(); fireEvent.click(screen.getByText('Open'));
    await screen.findByText('one (Records)');
    get.mockResolvedValue(page('new'));
    act(() => window.dispatchEvent(new Event('integral:records-changed')));
    await screen.findByText('new (Records)');
  });
});

it('cancels a pending read after a mutation and coalesces mounted subscribers', async () => {
  let signal: AbortSignal;
  get.mockImplementationOnce((_url, config) => {
    signal = config.signal;
    return new Promise(() => {});
  }).mockResolvedValue(page('after write'));
  setup(field(), 2);
  screen.getAllByText('Open').forEach(button => fireEvent.click(button));
  await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  act(() => {
    window.dispatchEvent(new Event('integral:records-changed'));
    window.dispatchEvent(new Event('integral:records-changed'));
  });
  await waitFor(() => expect(signal.aborted).toBe(true));
  await waitFor(() => expect(screen.getAllByText('after write (Records)')).toHaveLength(2));
  expect(get).toHaveBeenCalledTimes(2);
});
