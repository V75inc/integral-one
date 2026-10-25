import { afterEach, describe, expect, it, vi } from 'vitest';
import client from '../client';
import { feedApi } from '../feed';
import { getTypeNameMapForTrack } from '../entryTypes';
import { tracksApi } from '../tracks';
vi.mock('../client', () => ({ default: { get: vi.fn() } }));
vi.mock('../helpers', () => ({
  hydrateEntryTagsForList: vi.fn(), normalizeEntry: vi.fn(),
  unwrapApiDataEnvelope: (data: unknown) => data, toArr: () => [],
}));
vi.mock('../entryTypes', () => ({ getTypeNameMapForTrack: vi.fn().mockResolvedValue({}) }));
afterEach(() => vi.clearAllMocks());
describe('feed compatibility fallback', () => {
  it.each([429, 500, 503])('does not replay a %s against another endpoint', async status => {
    const error = { response: { status } };
    vi.mocked(client.get).mockRejectedValueOnce(error);
    await expect(feedApi.getEntriesPage({ entry_ids: 'one,two' })).rejects.toBe(error);
    expect(client.get).toHaveBeenCalledTimes(1);
  });
  it('retains fallback for an unavailable route', async () => {
    vi.mocked(client.get).mockRejectedValueOnce({ response: { status: 404 } }).mockResolvedValueOnce({ data: { entries: [], has_more: false } });
    await expect(feedApi.getEntriesPage()).resolves.toMatchObject({ entries: [] });
    expect(client.get).toHaveBeenCalledTimes(2);
  });
});

it('does not replay a ranked selection against an older route without that contract', async () => {
  const error = { response: { status: 404 } };
  vi.mocked(client.get).mockRejectedValueOnce(error);
  await expect(feedApi.getEntriesPage({ entry_ids: 'one,two' })).rejects.toBe(error);
  expect(client.get).toHaveBeenCalledTimes(1);
});


it('does not block feed rendering on redundant type lookups', async () => {
  vi.mocked(client.get).mockResolvedValueOnce({ data: { entries: [
    { id: 'typed', track_id: 'one', type_id: 'type1', type: 'invoice' },
    { id: 'untyped', track_id: 'two' },
  ], has_more: false } });
  await feedApi.getEntriesPage();
  expect(getTypeNameMapForTrack).not.toHaveBeenCalled();
});

it('retains one type lookup per legacy track with a missing type slug', async () => {
  vi.mocked(client.get).mockResolvedValueOnce({ data: { entries: [
    { id: 'one', track_id: 'legacy', type_id: 'type1' },
    { id: 'two', track_id: 'legacy', type_id: 'type2' },
  ], has_more: false } });
  await feedApi.getEntriesPage();
  expect(getTypeNameMapForTrack).toHaveBeenCalledExactlyOnceWith('legacy');
});


it('renders Track pages without a redundant type-name request', async () => {
  vi.mocked(client.get).mockResolvedValueOnce({ data: { entries: [
    { id: 'typed', track_id: 'one', type_id: 'type1', type: 'invoice' },
    { id: 'untyped', track_id: 'one' },
  ], has_more: false } });
  await tracksApi.getEntriesPage('one');
  expect(client.get).toHaveBeenCalledTimes(1);
  expect(getTypeNameMapForTrack).not.toHaveBeenCalled();
});

it('retains Track type enrichment for legacy payloads', async () => {
  vi.mocked(client.get).mockResolvedValueOnce({ data: { entries: [
    { id: 'one', track_id: 'legacy', type_id: 'type1' },
  ], has_more: false } });
  await tracksApi.getEntriesPage('legacy');
  expect(getTypeNameMapForTrack).toHaveBeenCalledExactlyOnceWith('legacy');
});
