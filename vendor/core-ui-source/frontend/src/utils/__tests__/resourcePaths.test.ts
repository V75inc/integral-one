import { describe, expect, it } from 'vitest';

import {
  appPath,
  entryPath,
  resolveNotificationHref,
  resourcePath,
  trackPath,
} from '../resourcePaths';
import type { Notification } from '../../types';

describe('resourcePaths', () => {
  it('builds track and app paths', () => {
    expect(trackPath('t-1')).toBe('/tracks/t-1');
    expect(appPath('a-1')).toBe('/apps/a-1');
  });

  it('builds entry deep links on a track', () => {
    expect(entryPath('e-1', 't-1')).toBe('/tracks/t-1?entry=e-1');
  });

  it('resourcePath returns null for entries without track id', () => {
    expect(resourcePath('entry', 'e-1')).toBeNull();
    expect(resourcePath('entry', 'e-1', { trackId: 't-1' })).toBe(
      '/tracks/t-1?entry=e-1',
    );
  });
});

describe('resolveNotificationHref', () => {
  const base: Notification = {
    id: 'n-1',
    user_id: 'u-1',
    type: 'mention',
    content: 'Alice: hello',
    read: false,
    created_at: '2026-01-01T00:00:00Z',
  };

  it('uses action_url when present', () => {
    expect(
      resolveNotificationHref({ ...base, action_url: '/tracks/t-1' }),
    ).toBe('/tracks/t-1');
  });

  it('derives mention links from metadata payload', () => {
    expect(
      resolveNotificationHref({
        ...base,
        metadata: {
          payload: { entry_id: 'e-1', track_id: 't-1' },
        },
      }),
    ).toBe('/tracks/t-1?entry=e-1');
  });

  it('rewrites legacy /entries URLs when track_id is known', () => {
    expect(
      resolveNotificationHref({
        ...base,
        action_url: '/entries/e-legacy',
        metadata: { track_id: 't-1' },
      }),
    ).toBe('/tracks/t-1?entry=e-legacy');
  });

  it('derives share links from resource metadata', () => {
    expect(
      resolveNotificationHref({
        ...base,
        type: 'share.collaborator_added',
        metadata: {
          resource_type: 'track',
          resource_id: 't-9',
        },
      }),
    ).toBe('/tracks/t-9');
  });

  it('derives invitation links from metadata payload', () => {
    expect(
      resolveNotificationHref({
        ...base,
        type: 'invitation',
        metadata: {
          payload: { invitation_id: 'inv-1' },
        },
      }),
    ).toBe('/invitations/received/inv-1');
  });
});
