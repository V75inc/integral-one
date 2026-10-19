import { describe, expect, it } from 'vitest';
import { upsertTrackInList } from '../upsertTrackInList';
import type { Track } from '../../types';

const track = (id: string, title = id) => ({ id, title }) as Track;

describe('upsertTrackInList', () => {
  it('adds a server-acknowledged track when the initial query had no data', () => {
    expect(upsertTrackInList(undefined, track('n.Track.1'))).toEqual([
      track('n.Track.1'),
    ]);
  });

  it('adds a newly created track to the current workspace list', () => {
    const existing = track('n.Track.1');
    expect(upsertTrackInList([existing], track('n.Track.2'))).toEqual([
      existing,
      track('n.Track.2'),
    ]);
  });

  it('replaces an existing track after an edit without duplicating it', () => {
    const existing = track('n.Track.1', 'Before');
    expect(upsertTrackInList([existing], track('n.Track.1', 'After'))).toEqual([
      track('n.Track.1', 'After'),
    ]);
  });
});
