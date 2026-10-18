import { describe, expect, it } from 'vitest';
import { buildPinnedSidebarEntries } from '../pinnedSidebarEntries';
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

describe('buildPinnedSidebarEntries', () => {
  it('nests pinned tracks under a pinned app', () => {
    const a = app('a1', 'CRM');
    const entries = buildPinnedSidebarEntries(
      [a],
      [track('t1', 'Leads', a), track('t2', 'Contacts', a)]
    );
    expect(entries).toEqual([
      {
        kind: 'app',
        app: a,
        tracks: [track('t1', 'Leads', a), track('t2', 'Contacts', a)],
      },
    ]);
  });

  it('groups multiple tracks when the app is not pinned', () => {
    const a = app('a1', 'CRM');
    const entries = buildPinnedSidebarEntries(
      [],
      [track('t1', 'Leads', a), track('t2', 'Contacts', a)]
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'app-group',
      appId: 'a1',
      appName: 'CRM',
      tracks: expect.any(Array),
    });
  });

  it('keeps a single pinned track flat when its app is not pinned', () => {
    const a = app('a1', 'CRM');
    const t = track('t1', 'Leads', a);
    const entries = buildPinnedSidebarEntries([], [t]);
    expect(entries).toEqual([{ kind: 'track', track: t }]);
  });

  it('renders orphan tracks without an app as flat rows', () => {
    const t = track('t1', 'Solo');
    const entries = buildPinnedSidebarEntries([], [t]);
    expect(entries).toEqual([{ kind: 'track', track: t }]);
  });
});
