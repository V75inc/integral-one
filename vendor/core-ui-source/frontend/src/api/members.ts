/**
 * Phase 16 ACC-08 — workspace-member helpers for the `member`
 * field type widget.
 *
 * The ``member`` field stores a graph ``User.id`` that MUST belong to
 * the entry track's workspace member pool (``IS_MEMBER_OF``). Helpers
 * here source candidates from ``GET /workspaces/{id}/members`` — not
 * the global ``GET /users`` directory (which includes collaborators and
 * other users who are not workspace members).
 */

import { workspacesApi, type WorkspaceMember } from './workspaces';
import type { Invitation, User } from '../types';

function memberAsUser(member: WorkspaceMember): User {
  return member as User;
}

export function matchesMemberSearch(member: WorkspaceMember, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const name = (member.display_name || '').toLowerCase();
  const email = (member.email || '').toLowerCase();
  const role = (member.role || '').toLowerCase();
  return name.includes(q) || email.includes(q) || role.includes(q);
}

export function filterWorkspaceMembers(
  members: WorkspaceMember[],
  query: string,
): WorkspaceMember[] {
  const q = query.trim().toLowerCase();
  if (!q) return members;
  return members.filter(m => matchesMemberSearch(m, q));
}

export function matchesInvitationSearch(invitation: Invitation, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  const email = (invitation.email || '').toLowerCase();
  const role = String(invitation.role || '').toLowerCase();
  const message = (invitation.message || '').toLowerCase();
  return email.includes(q) || role.includes(q) || message.includes(q);
}

export function filterWorkspaceInvitations(
  invitations: Invitation[],
  query: string,
): Invitation[] {
  const q = query.trim().toLowerCase();
  if (!q) return invitations;
  return invitations.filter(inv => matchesInvitationSearch(inv, q));
}

/** Workspace members eligible for a ``type: member`` field binding. */
export async function listWorkspaceMembersForPicker(
  workspaceId: string,
  search?: string,
): Promise<User[]> {
  if (!workspaceId) return [];
  const members = await workspacesApi.listMembers(workspaceId);
  return filterWorkspaceMembers(members, search ?? '').map(memberAsUser);
}

/**
 * Look up a User by node id (the canonical id the `member` field stores
 * in ``Entry.custom_fields[field_key]``) within a workspace roster.
 */
export async function lookupWorkspaceMemberById(
  userId: string,
  workspaceId: string,
): Promise<User | null> {
  if (!userId || !workspaceId) return null;
  const members = await workspacesApi.listMembers(workspaceId);
  const found = members.find(m => m.id === userId || m.user_id === userId);
  return found ? memberAsUser(found) : null;
}
