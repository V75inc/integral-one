import { describe, expect, it } from 'vitest';
import { getCollapsiblePinnedAppIds } from '../pinnedSidebarCollapse';
import type { App, Track } from '../../../types';

const app = (id: string, name: string): App => ({
  id,
  name,
  visibility: 'private',
  owner_user_id: 'u1',
});

const track = (id: string, title: string, parent?: App): Track => ({
  id,
  title,
  visibility: 'private',
  owner_id: 'u1',
  app: parent,
  created_at: '2026-01-01',
});

describe('getCollapsiblePinnedAppIds', () => {
  it('includes pinned apps and app-groups that have nested tracks', () => {
    const a = app('a1', 'CRM');
    const ids = getCollapsiblePinnedAppIds([
      { kind: 'app', app: a, tracks: [track('t1', 'Leads', a)] },
      {
        kind: 'app-group',
        appId: 'a2',
        appName: 'Ops',
        tracks: [track('t2', 'Tasks'), track('t3', 'Queue')],
      },
      { kind: 'track', track: track('t9', 'Solo') },
    ]);
    expect(ids).toEqual(['a1', 'a2']);
  });

  it('omits pinned apps with no nested tracks', () => {
    const a = app('a1', 'CRM');
    const ids = getCollapsiblePinnedAppIds([
      { kind: 'app', app: a, tracks: [] },
    ]);
    expect(ids).toEqual([]);
  });
});
