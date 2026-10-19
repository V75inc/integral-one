import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import {
  isUnscopedTracksListQueryKey,
  removeUnscopedCachesOnWorkspaceSwitch,
  WORKSPACE_SWITCH_UNSCOPED_PREFIXES,
} from '../../queryKeys';

describe('removeUnscopedCachesOnWorkspaceSwitch', () => {
  it('removes every cache keyed by unscoped workspace-switch prefixes', () => {
    const qc = new QueryClient();
    const removeSpy = vi.spyOn(qc, 'removeQueries');

    qc.setQueryData(['mission-control', 'snapshot'], { ok: true });
    qc.setQueryData(['dashboards', 'app-1'], [{ id: 'd1' }]);
    qc.setQueryData(['views', 'list', { track_id: 't1' }], []);
    qc.setQueryData(['tags', 'list', { track_id: 't1' }], []);
    qc.setQueryData(['notifications'], []);
    qc.setQueryData(['tracks', 'list', { limit: 100 }, 'ws-old'], []);
    qc.setQueryData(['tracks', 'list', { limit: 100 }], []);
    qc.setQueryData(['tracks', 'list', 'app', 'app-1'], []);
    qc.setQueryData(['tracks', 'list', 'for-bindings'], []);
    qc.setQueryData(['tracks', 'for-library-merge'], []);
    qc.setQueryData(['connectors', 'list'], ['old']);
    qc.setQueryData(['connectors', 'con-1', 'bindings'], ['old']);
    qc.setQueryData(['connectors', 'list', 'user-1', 'ws-new'], ['new']);

    removeUnscopedCachesOnWorkspaceSwitch(qc);

    // One per prefix plus predicates for legacy tracks and connector keys.
    expect(removeSpy).toHaveBeenCalledTimes(
      WORKSPACE_SWITCH_UNSCOPED_PREFIXES.length + 2,
    );
    for (const prefix of WORKSPACE_SWITCH_UNSCOPED_PREFIXES) {
      expect(removeSpy).toHaveBeenCalledWith({ queryKey: [prefix] });
    }
    // Workspace-partitioned tracks list survives the unscoped wipe.
    expect(qc.getQueryData(['tracks', 'list', { limit: 100 }, 'ws-old'])).toEqual(
      [],
    );
    expect(qc.getQueryData(['mission-control', 'snapshot'])).toBeUndefined();
    expect(qc.getQueryData(['dashboards', 'app-1'])).toBeUndefined();
    expect(qc.getQueryData(['views', 'list', { track_id: 't1' }])).toBeUndefined();
    expect(qc.getQueryData(['tags', 'list', { track_id: 't1' }])).toBeUndefined();
    expect(qc.getQueryData(['notifications'])).toBeUndefined();
    expect(qc.getQueryData(['tracks', 'list', { limit: 100 }])).toBeUndefined();
    expect(qc.getQueryData(['tracks', 'list', 'app', 'app-1'])).toBeUndefined();
    expect(qc.getQueryData(['tracks', 'list', 'for-bindings'])).toBeUndefined();
    expect(qc.getQueryData(['tracks', 'for-library-merge'])).toBeUndefined();
    expect(qc.getQueryData(['connectors', 'list'])).toBeUndefined();
    expect(qc.getQueryData(['connectors', 'con-1', 'bindings'])).toBeUndefined();
    expect(qc.getQueryData(['connectors', 'list', 'user-1', 'ws-new'])).toEqual(['new']);
  });
});

describe('isUnscopedTracksListQueryKey', () => {
  it('detects list keys that lack a workspace partition segment', () => {
    expect(isUnscopedTracksListQueryKey(['tracks', 'list', { limit: 100 }])).toBe(
      true,
    );
    expect(
      isUnscopedTracksListQueryKey(['tracks', 'list', { limit: 100 }, 'ws-1']),
    ).toBe(false);
    expect(isUnscopedTracksListQueryKey(['tracks', 'list', 'app', 'a1'])).toBe(
      true,
    );
    expect(
      isUnscopedTracksListQueryKey(['tracks', 'list', 'app', 'a1', 'ws-1']),
    ).toBe(false);
    expect(isUnscopedTracksListQueryKey(['tracks', 'list', 'for-bindings'])).toBe(
      true,
    );
    expect(isUnscopedTracksListQueryKey(['tracks', 'for-library-merge'])).toBe(
      true,
    );
    expect(isUnscopedTracksListQueryKey(['tracks', 'detail', 't1'])).toBe(false);
  });
});
