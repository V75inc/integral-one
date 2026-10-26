import React from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { feedApi } from '../../api/feed';
import { tracksApi } from '../../api/tracks';
import { useSearchResultEntries } from '../useSearchResultEntries';

vi.mock('../../api/feed', () => ({ feedApi: { getEntriesPage: vi.fn() } }));
vi.mock('../../api/tracks', () => ({ tracksApi: { getEntriesPage: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const page = { entries: [], nextCursor: null, hasMore: false };
const options = { workspaceId: 'w1', principalId: 'u1', entryIds: ['deep-301', 'deep-902'], enabled: true };

describe('ranked record hydration', () => {
  it('reads only returned IDs in one bounded request, with no page walk', async () => {
    vi.mocked(feedApi.getEntriesPage).mockResolvedValue(page);
    const { result } = renderHook(() => useSearchResultEntries(options), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(feedApi.getEntriesPage).toHaveBeenCalledExactlyOnceWith({ entry_ids: 'deep-301,deep-902', limit: 50, include_total: false });
  });
  it('does not retry a 429; retry is explicit', async () => {
    vi.mocked(feedApi.getEntriesPage).mockRejectedValue({ response: { status: 429 } });
    const { result } = renderHook(() => useSearchResultEntries(options), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(feedApi.getEntriesPage).toHaveBeenCalledTimes(1);
    vi.mocked(feedApi.getEntriesPage).mockResolvedValue(page);
    await act(async () => { await result.current.refetch(); });
    expect(feedApi.getEntriesPage).toHaveBeenCalledTimes(2);
  });
  it('keeps track view constraints and uses a separate cache per workspace', async () => {
    vi.mocked(tracksApi.getEntriesPage).mockResolvedValue(page);
    const { result, rerender } = renderHook(({ workspaceId }) => useSearchResultEntries({ ...options, workspaceId, trackId: 't1', params: { view_id: 'view1' } }), { initialProps: { workspaceId: 'w1' }, wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(tracksApi.getEntriesPage).toHaveBeenCalledWith('t1', { view_id: 'view1', entry_ids: 'deep-301,deep-902', limit: 50, include_total: false });
    rerender({ workspaceId: 'w2' });
    await waitFor(() => expect(tracksApi.getEntriesPage).toHaveBeenCalledTimes(2));
    expect(feedApi.getEntriesPage).not.toHaveBeenCalled();
  });
  it('does not fetch after clearing a search', () => {
    renderHook(() => useSearchResultEntries({ ...options, entryIds: [] }), { wrapper: wrapper() });
    expect(feedApi.getEntriesPage).not.toHaveBeenCalled();
  });
});

it('keeps edits and deletes visible in ranked matches without another list walk', async () => {
  vi.mocked(feedApi.getEntriesPage).mockResolvedValue({ ...page, entries: [{ id: 'deep-301', title: 'Old title' } as any] });
  const { result } = renderHook(() => useSearchResultEntries(options), { wrapper: wrapper() });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  act(() => result.current.patchPage(old => ({ ...old, entries: old.entries.map(entry => ({ ...entry, title: 'Updated title' })) })));
  await waitFor(() => expect(result.current.data?.entries[0].title).toBe('Updated title'));
  act(() => result.current.patchPage(old => ({ ...old, entries: [] })));
  await waitFor(() => expect(result.current.data?.entries).toEqual([]));
  expect(feedApi.getEntriesPage).toHaveBeenCalledTimes(1);
});
