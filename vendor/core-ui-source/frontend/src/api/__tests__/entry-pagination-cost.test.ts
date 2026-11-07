import { afterEach, expect, it, vi } from 'vitest';
import client from '../client';
import { feedApi } from '../feed';
import { fetchAllByCursor } from '../pagination';
import { tracksApi } from '../tracks';

vi.mock('../client', () => ({ default: { get: vi.fn() } }));
vi.mock('../helpers', () => ({
  hydrateEntryTagsForList: vi.fn(),
  normalizeEntry: (entry: unknown) => entry,
  unwrapApiDataEnvelope: (data: unknown) => data,
  toArr: () => [],
}));
vi.mock('../entryTypes', () => ({
  getTypeNameMapForTrack: vi.fn().mockResolvedValue({}),
}));
afterEach(() => vi.clearAllMocks());

it('traverses every cursor page without counting the full audience on each page', async () => {
  vi.mocked(client.get)
    .mockResolvedValueOnce({ data: { entries: [{ id: 'first' }], next_cursor: 'next', has_more: true } })
    .mockResolvedValueOnce({ data: { entries: [{ id: 'second' }], has_more: false } });
  await expect(fetchAllByCursor('/entries', { track_id: 'track' })).resolves.toEqual([
    { id: 'first' }, { id: 'second' },
  ]);
  expect(client.get).toHaveBeenNthCalledWith(1, '/entries', {
    params: { track_id: 'track', limit: 100, cursor: undefined, include_total: false },
  });
  expect(client.get).toHaveBeenNthCalledWith(2, '/entries', {
    params: { track_id: 'track', limit: 100, cursor: 'next', include_total: false },
  });
});

it.each(['feed', 'track'] as const)('%s continuation omits the repeated total', async surface => {
  vi.mocked(client.get).mockResolvedValue({ data: { entries: [], has_more: false } });
  if (surface === 'feed') await feedApi.getEntriesPage({ cursor: 'next' });
  else await tracksApi.getEntriesPage('track', { cursor: 'next' });
  expect(client.get).toHaveBeenCalledWith(surface === 'feed' ? '/feed_entries' : '/tracks/track/entries', {
    params: { limit: 20, cursor: 'next', include_total: false },
  });
});

it.each(['feed', 'track'] as const)('%s retains the initial exact total and explicit count requests', async surface => {
  vi.mocked(client.get).mockResolvedValue({ data: { entries: [], has_more: false, total: 42 } });
  const read = (params?: Record<string, unknown>) => surface === 'feed'
    ? feedApi.getEntriesPage(params)
    : tracksApi.getEntriesPage('track', params);
  expect((await read()).total).toBe(42);
  expect(client.get).toHaveBeenLastCalledWith(expect.any(String), {
    params: { limit: 20, include_total: true },
  });
  await read({ cursor: 'next', include_total: true });
  expect(client.get).toHaveBeenLastCalledWith(expect.any(String), {
    params: { limit: 20, cursor: 'next', include_total: true },
  });
});
