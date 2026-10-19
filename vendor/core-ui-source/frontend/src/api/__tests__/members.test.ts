import { describe, it, expect } from 'vitest';
import type { WorkspaceMember } from '../workspaces';
import type { Invitation } from '../../types';
import {
  matchesMemberSearch,
  filterWorkspaceMembers,
  matchesInvitationSearch,
  filterWorkspaceInvitations,
} from '../members';

const sampleMembers: WorkspaceMember[] = [
  {
    id: 'u1',
    display_name: 'Alice Admin',
    email: 'alice@example.com',
    role: 'admin',
  },
  {
    id: 'u2',
    display_name: 'Bob Member',
    email: 'bob@example.com',
    role: 'member',
  },
  {
    id: 'u3',
    display_name: 'Carol Guest',
    email: 'carol@example.com',
    role: 'guest',
  },
];

const sampleInvitations: Invitation[] = [
  {
    id: 'inv1',
    workspace_id: 'ws1',
    email: 'pending@example.com',
    invited_by_user_id: 'u1',
    role: 'member',
    can_create_apps: false,
    can_create_tracks: false,
    status: 'pending',
    message: 'Join our team',
  },
  {
    id: 'inv2',
    workspace_id: 'ws1',
    email: 'admin-invite@example.com',
    invited_by_user_id: 'u1',
    role: 'admin',
    can_create_apps: true,
    can_create_tracks: true,
    status: 'pending',
  },
];

describe('matchesMemberSearch', () => {
  it('matches display_name', () => {
    expect(matchesMemberSearch(sampleMembers[0], 'alice')).toBe(true);
  });

  it('matches email', () => {
    expect(matchesMemberSearch(sampleMembers[1], 'bob@')).toBe(true);
  });

  it('matches role', () => {
    expect(matchesMemberSearch(sampleMembers[2], 'guest')).toBe(true);
    expect(matchesMemberSearch(sampleMembers[0], 'admin')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesMemberSearch(sampleMembers[0], 'zzznomatch')).toBe(false);
  });

  it('returns false for blank query', () => {
    expect(matchesMemberSearch(sampleMembers[0], '   ')).toBe(false);
  });
});

describe('filterWorkspaceMembers', () => {
  it('returns full list for empty query', () => {
    expect(filterWorkspaceMembers(sampleMembers, '')).toEqual(sampleMembers);
    expect(filterWorkspaceMembers(sampleMembers, '   ')).toEqual(sampleMembers);
  });

  it('filters by name, email, or role', () => {
    expect(filterWorkspaceMembers(sampleMembers, 'alice')).toHaveLength(1);
    expect(filterWorkspaceMembers(sampleMembers, 'bob@')).toHaveLength(1);
    expect(filterWorkspaceMembers(sampleMembers, 'guest')).toHaveLength(1);
  });

  it('returns empty array when no match', () => {
    expect(filterWorkspaceMembers(sampleMembers, 'zzznomatch')).toEqual([]);
  });
});

describe('matchesInvitationSearch', () => {
  it('matches email', () => {
    expect(matchesInvitationSearch(sampleInvitations[0], 'pending@')).toBe(true);
  });

  it('matches role', () => {
    expect(matchesInvitationSearch(sampleInvitations[1], 'admin')).toBe(true);
  });

  it('matches message', () => {
    expect(matchesInvitationSearch(sampleInvitations[0], 'join our')).toBe(true);
  });

  it('returns false when nothing matches', () => {
    expect(matchesInvitationSearch(sampleInvitations[0], 'zzznomatch')).toBe(false);
  });
});

describe('filterWorkspaceInvitations', () => {
  it('returns full list for empty query', () => {
    expect(filterWorkspaceInvitations(sampleInvitations, '')).toEqual(
      sampleInvitations,
    );
  });

  it('filters by email or role', () => {
    expect(filterWorkspaceInvitations(sampleInvitations, 'admin')).toHaveLength(1);
    expect(filterWorkspaceInvitations(sampleInvitations, 'pending@')).toHaveLength(1);
  });
});
