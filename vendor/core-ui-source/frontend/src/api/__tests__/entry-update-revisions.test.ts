import { afterEach, expect, it, vi } from 'vitest';
import client from '../client';
import { entriesApi } from '../entries';

vi.mock('../client', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
vi.mock('../helpers', () => ({
  hydrateEntryTagsForList: vi.fn(),
  normalizeEntry: (entry: unknown) => entry,
  unwrapResource: (data: unknown) => data,
}));
vi.mock('../entryTypes', () => ({ getTypeNameMapForTrack: vi.fn() }));
afterEach(() => vi.restoreAllMocks());

it('uses the loaded draft revisions without a redundant preflight read', async () => {
  const read = vi.spyOn(entriesApi, 'get');
  vi.mocked(client.put).mockResolvedValue({ data: { id: 'entry', record_revision: 8, schema_revision: 3 } });
  await entriesApi.update('entry', { title: 'Edited', expected_record_revision: 7, expected_schema_revision: 3 });
  expect(read).not.toHaveBeenCalled();
  expect(client.put).toHaveBeenLastCalledWith('/entries/entry', {
    title: 'Edited', expected_record_revision: 7, expected_schema_revision: 3,
  });
});

it.each([{}, { expected_record_revision: 7 }, { expected_schema_revision: 3 }])(
  'fills missing revisions without replacing a supplied stale revision: %j', async supplied => {
    const read = vi.spyOn(entriesApi, 'get').mockResolvedValue({ id: 'entry', record_revision: 9, schema_revision: 4 } as never);
    vi.mocked(client.put).mockResolvedValue({ data: { id: 'entry' } });
    await entriesApi.update('entry', { title: 'Edited', ...supplied });
    expect(read).toHaveBeenCalledExactlyOnceWith('entry');
    expect(client.put).toHaveBeenLastCalledWith('/entries/entry', {
      title: 'Edited', expected_record_revision: 9, expected_schema_revision: 4, ...supplied,
    });
  },
);
