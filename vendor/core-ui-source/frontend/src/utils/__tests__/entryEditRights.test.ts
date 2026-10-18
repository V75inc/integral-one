import { describe, it, expect } from 'vitest';
import {
  canAdminTrackForRole,
  canCommentForRole,
  canCreateEntryForRole,
  canEditEntry,
  canManageCollaboratorsForRole,
  canViewCollaboratorsForRole,
  canViewTrackConfigForRole,
  resolveTrackPermissions,
  resolveTrackRoleForUser,
} from '../entryEditRights';
import type { Entry, Track, User } from '../../types';

const editorUser: User = {
  id: 'n.User.editor',
  user_id: 'o.User.editor',
  display_name: 'Editor',
  created_at: '2026-01-01T00:00:00Z',
};

const authorUser: User = {
  id: 'n.User.author',
  user_id: 'o.User.author',
  display_name: 'Author',
  created_at: '2026-01-01T00:00:00Z',
};

const track: Track = {
  id: 'n.Track.1',
  title: 'Demo',
  visibility: 'private',
  owner_id: 'n.User.owner',
  collaborators: [
    {
      id: 'n.User.editor',
      display_name: 'Editor',
      role: 'editor',
      created_at: '2026-01-01T00:00:00Z',
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
};

const entry: Entry = {
  id: 'n.Entry.1',
  title: 'Post',
  type: 'note',
  track_id: track.id,
  author_id: 'n.User.author',
  created_at: '2026-01-01T00:00:00Z',
};

describe('entryEditRights', () => {
  it('resolves editor role from track collaborators', () => {
    expect(resolveTrackRoleForUser(editorUser, track)).toBe('editor');
  });

  it('allows track editor to edit another authors entry', () => {
    expect(canEditEntry(editorUser, entry, track)).toBe(true);
  });

  it('allows commenter to edit only their own entry', () => {
    const commenterTrack: Track = {
      ...track,
      collaborators: [
        {
          id: 'n.User.author',
          display_name: 'Author',
          role: 'commenter',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    expect(canEditEntry(authorUser, entry, commenterTrack)).toBe(true);
    expect(canEditEntry(editorUser, entry, commenterTrack)).toBe(false);
  });

  it('denies viewer without author fallback', () => {
    const viewerTrack: Track = {
      ...track,
      collaborators: [
        {
          id: 'n.User.editor',
          display_name: 'Editor',
          role: 'viewer',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    expect(canEditEntry(editorUser, entry, viewerTrack)).toBe(false);
  });
});

describe('track permission matrix', () => {
  const roles = ['owner', 'admin', 'editor', 'commenter', 'viewer'] as const;

  it('canCreateEntryForRole', () => {
    expect(canCreateEntryForRole('owner')).toBe(true);
    expect(canCreateEntryForRole('admin')).toBe(true);
    expect(canCreateEntryForRole('editor')).toBe(true);
    expect(canCreateEntryForRole('commenter')).toBe(false);
    expect(canCreateEntryForRole('viewer')).toBe(false);
    expect(canCreateEntryForRole(null)).toBe(false);
  });

  it('canAdminTrackForRole', () => {
    expect(canAdminTrackForRole('owner')).toBe(true);
    expect(canAdminTrackForRole('admin')).toBe(true);
    expect(canAdminTrackForRole('editor')).toBe(false);
    expect(canAdminTrackForRole('commenter')).toBe(false);
  });

  it('canViewTrackConfigForRole and canViewCollaboratorsForRole', () => {
    for (const role of ['owner', 'admin', 'editor'] as const) {
      expect(canViewTrackConfigForRole(role)).toBe(true);
      expect(canViewCollaboratorsForRole(role)).toBe(true);
    }
    for (const role of ['commenter', 'viewer'] as const) {
      expect(canViewTrackConfigForRole(role)).toBe(false);
      expect(canViewCollaboratorsForRole(role)).toBe(false);
    }
  });

  it('canManageCollaboratorsForRole', () => {
    expect(canManageCollaboratorsForRole('owner')).toBe(true);
    expect(canManageCollaboratorsForRole('admin')).toBe(true);
    for (const role of ['editor', 'commenter', 'viewer'] as const) {
      expect(canManageCollaboratorsForRole(role)).toBe(false);
    }
  });

  it('canCommentForRole', () => {
    for (const role of ['owner', 'admin', 'editor', 'commenter'] as const) {
      expect(canCommentForRole(role)).toBe(true);
    }
    expect(canCommentForRole('viewer')).toBe(false);
    expect(canCommentForRole(null)).toBe(false);
  });

  it('resolveTrackPermissions bundles role helpers', () => {
    const commenterTrack: Track = {
      ...track,
      collaborators: [
        {
          id: 'n.User.author',
          display_name: 'Author',
          role: 'commenter',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const perms = resolveTrackPermissions(authorUser, commenterTrack);
    expect(perms.role).toBe('commenter');
    expect(perms.canCreateEntry).toBe(false);
    expect(perms.canAdminTrack).toBe(false);
    expect(perms.canViewTrackConfig).toBe(false);
    expect(perms.canViewCollaborators).toBe(false);
    expect(perms.canManageCollaborators).toBe(false);
    expect(perms.canComment).toBe(true);
  });

  it('resolves role when collaborator row uses user_id principal', () => {
    const viewerUser: User = {
      id: 'n.User.viewer',
      user_id: 'o.User.viewer',
      display_name: 'Viewer',
      created_at: '2026-01-01T00:00:00Z',
    };
    const viewerTrack: Track = {
      ...track,
      collaborators: [
        {
          id: 'n.User.viewer',
          user_id: 'o.User.viewer',
          display_name: 'Viewer',
          role: 'viewer',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
    };
    expect(resolveTrackRoleForUser(viewerUser, viewerTrack)).toBe('viewer');
    expect(canCommentForRole(resolveTrackRoleForUser(viewerUser, viewerTrack))).toBe(
      false,
    );
  });

  it('prefers caller_role over collaborators list (staff / App cascade)', () => {
    const staffUser: User = {
      id: 'n.User.staff',
      user_id: 'o.User.staff',
      display_name: 'Staff',
      created_at: '2026-01-01T00:00:00Z',
    };
    const publicTrack: Track = {
      ...track,
      visibility: 'public',
      collaborators: [],
      caller_role: 'admin',
    };
    const perms = resolveTrackPermissions(staffUser, publicTrack);
    expect(perms.role).toBe('admin');
    expect(perms.canComment).toBe(true);
  });

  it('ignores excluded collaborator rows when caller_role is absent', () => {
    const excludedTrack: Track = {
      ...track,
      collaborators: [
        {
          id: 'n.User.editor',
          display_name: 'Editor',
          role: 'editor',
          created_at: '2026-01-01T00:00:00Z',
          excluded: true,
          effective_access: false,
        } as User,
      ],
    };
    expect(resolveTrackRoleForUser(editorUser, excludedTrack)).toBeNull();
  });

  it('covers all five roles without throwing', () => {
    for (const role of roles) {
      expect(typeof canCreateEntryForRole(role)).toBe('boolean');
      expect(typeof canCommentForRole(role)).toBe('boolean');
    }
  });
});
