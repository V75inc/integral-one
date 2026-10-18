import { describe, expect, it } from 'vitest';
import { pathAfterTrackDelete } from '../pathAfterTrackDelete';

describe('pathAfterTrackDelete', () => {
  it('returns the parent app when the track belongs to one', () => {
    expect(
      pathAfterTrackDelete({
        app: { id: 'n.WorkspaceApp.f2a81b959d894a2484f05dec', name: 'App', visibility: 'private' },
      })
    ).toBe('/apps/n.WorkspaceApp.f2a81b959d894a2484f05dec');
  });

  it('falls back to the tracks list when the track has no app', () => {
    expect(pathAfterTrackDelete({})).toBe('/tracks');
    expect(pathAfterTrackDelete({ app: undefined })).toBe('/tracks');
  });
});
