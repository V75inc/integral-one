/**
 * Task M3c-2 — frontend API client for the per-user "connected agents"
 * surface (MCP clients that have completed the DCR + browser-OAuth consent
 * flow and hold an active grant).
 *
 * Backend contract (M3c, core):
 *   - GET    /api/users/me/connected-agents          → ConnectedAgent[]
 *   - DELETE /api/users/me/connected-agents/{client}  → { revoked: number }
 *
 * The shared axios client (`./client`) prefixes `/api` and attaches the JWT
 * bearer, so both calls are authenticated as the logged-in user. Mirrors the
 * hand-written idiom of `agents.ts` / `oauthConsent.ts`: the backend Pydantic
 * boundary is the single source of truth — adding a field here without a
 * matching backend change is a contract violation.
 */
import api from './client';

/** One MCP client the user has granted access to. */
export interface ConnectedAgent {
  client_id: string;
  client_name: string;
  scopes: string[];
  granted_at: string;
}

/** Shape returned by DELETE — number of grants revoked for the client. */
export interface RevokeResult {
  revoked: number;
}

export const connectedAgentsApi = {
  async list(): Promise<ConnectedAgent[]> {
    const { data } = await api.get<ConnectedAgent[]>(
      '/users/me/connected-agents',
    );
    return data;
  },
  async revoke(clientId: string): Promise<RevokeResult> {
    const { data } = await api.delete<RevokeResult>(
      `/users/me/connected-agents/${clientId}`,
    );
    return data;
  },
};
