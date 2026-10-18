import apiClient from './client';

export interface SuspensionReview {
  state: 'active' | 'suspended' | 'resumed';
  revision: number;
  membership_retained: boolean;
  membership_role: string | null;
  reviewed_access_digest: string;
  retained_access?: Array<{ resource_type: string; resource_id: string; role?: string; source?: string }>;
}
export interface AccessGroup { id: string; name: string; active?: boolean }
export interface GroupMember { user: { id: string; display_name?: string }; active: boolean }
export interface ActionBinding { id: string; subject_kind: string; subject_id: string; role: string; active: boolean; definition_id: string }

export const accessControlApi = {
  async reviewSuspension(workspaceId: string, memberId: string): Promise<SuspensionReview> {
    return (await apiClient.get(`/workspaces/${workspaceId}/members/${memberId}/suspension`)).data;
  },
  async setSuspension(workspaceId: string, memberId: string, suspended: boolean, review?: SuspensionReview) {
    return (await apiClient.put(`/workspaces/${workspaceId}/members/${memberId}/suspension`, {
      suspended,
      ...(!suspended && review ? { expected_revision: review.revision, reviewed_access_digest: review.reviewed_access_digest } : {}),
    })).data;
  },
  async groups(workspaceId: string, cursor?: string): Promise<{ groups: AccessGroup[]; next_cursor: string | null }> {
    return (await apiClient.get(`/workspaces/${workspaceId}/access-groups`, { params: { cursor } })).data;
  },
  async createGroup(workspaceId: string, name: string): Promise<AccessGroup> {
    return (await apiClient.post(`/workspaces/${workspaceId}/access-groups`, { name })).data;
  },
  async groupMembers(groupId: string, cursor?: string): Promise<{ members: GroupMember[]; next_cursor: string | null }> {
    return (await apiClient.get(`/access-groups/${groupId}/members`, { params: { cursor } })).data;
  },
  async groupMember(groupId: string, userId: string, member: boolean) {
    const path = `/access-groups/${groupId}/members/${userId}`;
    return member ? apiClient.put(path, {}) : apiClient.delete(path);
  },
  async deleteGroup(groupId: string) { return apiClient.delete(`/access-groups/${groupId}`); },
  async bindings(appId: string, cursor?: string): Promise<{ bindings: ActionBinding[]; next_cursor: string | null; definition_id: string; role_actions: Record<string, string[]> }> {
    return (await apiClient.get(`/apps/${appId}/action-bindings`, { params: { cursor } })).data;
  },
  async bind(appId: string, subjectKind: 'human' | 'group', subjectId: string, role: string) {
    return (await apiClient.post(`/apps/${appId}/action-bindings`, { subject_kind: subjectKind, subject_id: subjectId, role, conditions: [] })).data;
  },
  async revokeBinding(bindingId: string) { return apiClient.delete(`/action-bindings/${bindingId}`); },
};

export interface OwnershipProposal {
  proposal_id: string;
  workspace_id: string;
  resource_type: 'workspace' | 'app' | 'track';
  resource_id: string;
  recipient_id: string;
  status: string;
  revision: number;
  expires_at: string;
  expired: boolean;
  ownership_current: boolean;
}
export const ownershipConsentApi = {
  async inbox(): Promise<{ proposals: OwnershipProposal[]; complete: boolean }> {
    return (await apiClient.get('/me/ownership-proposals')).data;
  },
  async workspace(workspaceId: string): Promise<{ proposals: OwnershipProposal[]; complete: boolean }> {
    return (await apiClient.get(`/workspaces/${workspaceId}/ownership-proposals`)).data;
  },
  async propose(workspaceId: string, recipientId: string) {
    return (await apiClient.post(`/workspaces/${workspaceId}/ownership-proposals`, { recipient_id: recipientId })).data;
  },
  async respond(proposal: OwnershipProposal, action: 'accept' | 'decline') {
    return (await apiClient.post(`/ownership-proposals/${proposal.proposal_id}/respond`, { action, revision: proposal.revision })).data;
  },
};
