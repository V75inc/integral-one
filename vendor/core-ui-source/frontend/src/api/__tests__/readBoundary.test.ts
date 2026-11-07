import { afterEach, describe, expect, it, vi } from 'vitest';
import client from '../client';
import { feedApi } from '../feed';
import { tracksApi } from '../tracks';
import { requiresAppQuery } from '../readBoundary';

vi.mock('../client', () => ({ default: { get: vi.fn() } }));
vi.mock('../helpers', async () => ({
  ...await vi.importActual('../helpers'),
  hydrateEntryTagsForList: vi.fn(),
  normalizeEntry: (entry: unknown) => entry,
}));
afterEach(() => vi.clearAllMocks());

describe('record read coverage', () => {
  it.each([
    { boundary: { declared_query_required: true, excluded_tracks: 4 } },
    { refused: { declared_query_required: true } },
    { refused: { code: 'app_domain' } },
  ])('preserves an App restriction for Feed and Track pages: %j', async restriction => {
    vi.mocked(client.get).mockResolvedValue({ data: { success: true, data: {
      entries: [], total: 0, has_more: false,
      ...restriction,
    } } });
    const feed = await feedApi.getEntriesPage();
    const track = await tracksApi.getEntriesPage('track-one');
    expect(feed).toMatchObject({ entries: [], appQueryRequired: true });
    expect(track).toMatchObject({ entries: [], appQueryRequired: true });
    expect(client.get).toHaveBeenCalledTimes(2);
  });

  it('keeps accessible rows and the cursor when a partial page excludes App records', async () => {
    const entries = [{ id: 'ordinary-entry', track_id: 'ordinary-track', title: 'Workspace note' }];
    vi.mocked(client.get).mockResolvedValue({ data: {
      entries, next_cursor: 'next-page', has_more: true,
      boundary: { declared_query_required: true, excluded_tracks: 99 },
    } });
    await expect(feedApi.getEntriesPage()).resolves.toEqual({
      entries, nextCursor: 'next-page', hasMore: true, total: undefined,
      appQueryRequired: true,
    });
  });

  it('does not retain excluded IDs, counts or server messages in display metadata', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: {
      entries: [], has_more: false,
      refused: { code: 'app_domain', app_id: 'private-app', message: 'Server-only detail' },
      boundary: { declared_query_required: true, excluded_tracks: 99 },
    } });
    const page = await feedApi.getEntriesPage();
    expect(page.appQueryRequired).toBe(true);
    expect(JSON.stringify(page)).not.toMatch(/private-app|Server-only detail|excluded_tracks/);
  });

  it.each([null, undefined, [], {}, { boundary: null }, { refused: 'app_domain' },
    { boundary: { declared_query_required: false } },
    { boundary: { declared_query_required: 'true' } },
    { refused: { code: 'permission_denied' } },
  ])('does not invent an App restriction from %j', payload => {
    expect(requiresAppQuery(payload)).toBe(false);
  });

  it('does not add a coverage warning to a genuinely empty open page', async () => {
    vi.mocked(client.get).mockResolvedValue({ data: { entries: [], has_more: false } });
    expect((await feedApi.getEntriesPage()).appQueryRequired).toBeUndefined();
    expect((await tracksApi.getEntriesPage('ordinary-track')).appQueryRequired).toBeUndefined();
  });
});
