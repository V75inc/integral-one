import { describe, it, expect } from 'vitest';
import { resolveCreationRights } from '../useWorkspaceCreationRights';
import type { Workspace } from '../../api/workspaces';

const orgBase: Workspace = {
  id: 'ws-org',
  kind: 'organization',
  name: 'Acme',
  your_role: 'member',
};

describe('resolveCreationRights', () => {
  it('returns false when workspace is null', () => {
    expect(resolveCreationRights(null)).toEqual({
      canCreateApps: false,
      canCreateTracks: false,
      lacksAppCreationInOrg: false,
      lacksTrackCreationInOrg: false,
    });
  });

  it('grants both rights to personal workspace members', () => {
    const rights = resolveCreationRights({
      id: 'ws-personal',
      kind: 'personal',
      name: 'Personal',
      your_role: 'member',
      can_create_apps: false,
      can_create_tracks: false,
    });
    expect(rights.canCreateApps).toBe(true);
    expect(rights.canCreateTracks).toBe(true);
    expect(rights.lacksAppCreationInOrg).toBe(false);
    expect(rights.lacksTrackCreationInOrg).toBe(false);
  });

  it('grants both rights to org owners regardless of edge flags', () => {
    const rights = resolveCreationRights({
      ...orgBase,
      your_role: 'owner',
      can_create_apps: false,
      can_create_tracks: false,
    });
    expect(rights.canCreateApps).toBe(true);
    expect(rights.canCreateTracks).toBe(true);
    expect(rights.lacksAppCreationInOrg).toBe(false);
    expect(rights.lacksTrackCreationInOrg).toBe(false);
  });

  it('does not auto-grant org admins — edge flags are authoritative', () => {
    const rights = resolveCreationRights({
      ...orgBase,
      your_role: 'admin',
      can_create_apps: false,
      can_create_tracks: false,
    });
    expect(rights.canCreateApps).toBe(false);
    expect(rights.canCreateTracks).toBe(false);
    expect(rights.lacksAppCreationInOrg).toBe(true);
    expect(rights.lacksTrackCreationInOrg).toBe(true);
  });

  it('honours creation flags for org admins when explicitly granted', () => {
    const rights = resolveCreationRights({
      ...orgBase,
      your_role: 'admin',
      can_create_apps: true,
      can_create_tracks: true,
    });
    expect(rights.canCreateApps).toBe(true);
    expect(rights.canCreateTracks).toBe(true);
    expect(rights.lacksAppCreationInOrg).toBe(false);
    expect(rights.lacksTrackCreationInOrg).toBe(false);
  });

  it('honours org member creation flags from the workspace payload', () => {
    const rights = resolveCreationRights({
      ...orgBase,
      can_create_apps: true,
      can_create_tracks: false,
    });
    expect(rights.canCreateApps).toBe(true);
    expect(rights.canCreateTracks).toBe(false);
    expect(rights.lacksAppCreationInOrg).toBe(false);
    expect(rights.lacksTrackCreationInOrg).toBe(true);
  });

  it('flags lacking rights for org members without creation flags', () => {
    const rights = resolveCreationRights({
      ...orgBase,
      can_create_apps: false,
      can_create_tracks: false,
    });
    expect(rights.canCreateApps).toBe(false);
    expect(rights.canCreateTracks).toBe(false);
    expect(rights.lacksAppCreationInOrg).toBe(true);
    expect(rights.lacksTrackCreationInOrg).toBe(true);
  });
});
