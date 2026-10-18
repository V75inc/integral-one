/**
 * Phase 8 Plan 08-05 — Sharing aggregator API client.
 *
 * Mirrors `backend/app/schemas/sharing_overview.py` shapes (hand-mirrored
 * Pydantic boundary, per existing `approvals.ts` precedent — Pitfall 8
 * mitigation: every new frontend/src/api file MUST cite the backend schema).
 *
 * Surface: `GET /api/me/sharing-overview` — caller-scoped OUTBOUND aggregate
 * for the SET-08 Settings -> Sharing index panel. Per A2, this is an INDEX
 * page, NOT a duplicate of per-resource controls (those live on
 * App/Track/Entry detail pages via ManageAccessModal).
 */
import apiClient from './client';

export interface OutboundShareLink {
  id: string;
  resource_type: 'app' | 'track' | 'entry';
  resource_id: string;
  resource_label: string;
  role: string;
  created_at: string | null;
  expires_at: string | null;
  redemptions: number;
}

export interface OutboundExclusion {
  resource_type: 'app' | 'track' | 'entry';
  resource_id: string;
  resource_label: string;
  excluded_user_id: string;
  excluded_user_display: string | null;
  reason: string | null;
  created_at: string | null;
}

export interface OutboundInvitation {
  id: string;
  resource_type: 'app' | 'track' | 'entry';
  resource_id: string;
  resource_label: string;
  invitee_email: string | null;
  invitee_user_id: string | null;
  role: string;
  status: string;
  created_at: string | null;
  expires_at: string | null;
}

export interface SharingOverviewResponse {
  share_links: OutboundShareLink[];
  exclusions: OutboundExclusion[];
  invitations: OutboundInvitation[];
}

export const sharingOverviewApi = {
  /** Fetch the caller's outbound sharing aggregate.
   *  Backend strictly scopes by OWNS + ShareLink.created_by + Invitation.created_by;
   *  no other user's outbound state can leak through (T-08-05-I01). */
  async get(): Promise<SharingOverviewResponse> {
    const { data } = await apiClient.get<SharingOverviewResponse>(
      '/me/sharing-overview',
    );
    return data;
  },
};
