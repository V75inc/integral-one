/**
 * Phase 8 Plan 08-02 — frontend API client for /api/agentive/connectors
 * + /api/connectors/{id}/sync.
 *
 * Mirrors backend/app/schemas/agentive/connectors.py (ConnectorResponse +
 * UpdateConnectorRequest + ConnectorListResponse) and the Phase 5 manual
 * sync trigger at backend/app/api/connectors.py:34-83.
 *
 * Hand-mirrored per the approvals.ts idiom — the backend Pydantic
 * boundary is the single source of truth. Adding a field here without a
 * matching backend change is a contract violation.
 *
 * NOTE — `conflict_policy` is read-only, DERIVED from the SyncConnector
 * subclass registry at serialization time (Phase 8 A5). It is NEVER sent in
 * a PATCH body. To change the conflict policy, change `subclass_slug`.
 */
import api from './client';

export type AgentType = 'integral_native' | 'mcp' | 'open_claw' | 'skill_bundle' | 'custom';

export interface DiscoveredMcpTool {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown> | null;
}

export interface ConnectorResponse {
  id: string;
  kind: AgentType;
  owner: string;
  auth_state: Record<string, unknown>;
  sync_cursor: string | null;
  mapping_profile: string | null;
  permissions: string[];
  capabilities: string[];
  conflict_policy: string | null;
  subclass_slug: string | null;
  sync_interval_seconds: number;
  last_synced_at: string | null;
  /** ADR-009 MCP client mount fields */
  workspace_id?: string | null;
  health_status?: McpHealthStatus | null;
  last_error?: string | null;
  last_health_at?: string | null;
  /** Present on some MCP fixtures; live tools also live on auth_state. */
  discovered_tools?: DiscoveredMcpTool[];
  /** Connector scoping: per-user (owner-only) or shared (member-invocable). */
  connection_mode?: string | null;
  /** Operator display label (falls back to catalog name when blank). */
  label?: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ConnectorCreate {
  kind?: AgentType;
  auth_state?: Record<string, unknown>;
  sync_cursor?: string;
  mapping_profile?: string;
  permissions?: string[];
  capabilities?: string[];
}

export interface ConnectorUpdate {
  subclass_slug?: string;
  sync_interval_seconds?: number;
  auth_state?: Record<string, unknown>;
  mapping_profile?: string;
  permissions?: string[];
  capabilities?: string[];
  label?: string;
}

export interface ConnectorListResponse {
  connectors: ConnectorResponse[];
  total: number;
}

export type CatalogCategory = 'native' | 'mcp_server' | 'mcp_package';
export type CatalogKind = 'sync' | 'mcp';
export type CatalogAuthType = 'oauth2' | 'api_key' | 'env' | 'none' | 'headers';

export interface CatalogAuthField {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
  control?: 'text' | 'toggle';
  default?: string | null;
  hint?: string | null;
  /** Hides behind the install sheet's Advanced Options toggle. */
  advanced?: boolean;
}

export interface CatalogEntry {
  slug: string;
  display_name: string;
  description: string;
  category: CatalogCategory;
  kind: CatalogKind;
  icon: string;
  vetted: boolean;
  auth: {
    type: CatalogAuthType;
    fields: CatalogAuthField[];
  };
  transport?: 'stdio' | 'streamable_http' | null;
  url?: string | null;
  command?: string | null;
  args?: string[];
  // Visibility gate: hidden entries never appear in the catalog LIST
  // (server-filtered); the flag is defense-in-depth for direct GETs.
  hidden?: boolean;
  deprecated_in_favor_of?: string | null;
  // Auth field names the platform provides via server env — the install
  // sheet hides these behind Advanced Options. Names only, never values.
  platform_configured?: string[];
}

export interface CatalogListResponse {
  entries: CatalogEntry[];
  total: number;
}

export type ConnectionMode = 'per_user' | 'shared';

export interface CatalogInstallRequest {
  secrets?: Record<string, string>;
  label?: string;
  connection_mode?: ConnectionMode;
}

export interface CatalogInstallResponse {
  action: 'oauth' | 'created';
  slug: string;
  consent_url?: string | null;
  state?: string | null;
  connector?: ConnectorResponse | null;
}

export interface SyncStats {
  created: number;
  updated: number;
  conflict: number;
  archived: number;
  errors: string[];
}

export interface ConnectorToolInfo {
  key: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  scope: 'canonical' | 'row';
  write: boolean;
}

export interface ConnectorToolsResponse {
  connector_id: string;
  tools: ConnectorToolInfo[];
}

// ── Task 3 — IS_CONNECTED_TO Track bindings ─────────────────────────

export interface ConnectorBinding {
  connector_id: string;
  track_id: string;
  track_title: string | null;
  workspace_id: string | null;
  mapping_profile_yaml: string;
  bidirectional: boolean;
}

export interface ConnectorBindingListResponse {
  bindings: ConnectorBinding[];
  total: number;
}

export interface CreateConnectorBindingBody {
  track_id: string;
  mapping_profile_yaml?: string;
  bidirectional?: boolean;
}

// ── Phase 19 — Gmail OAuth helpers ───────────────────────────────

export interface GmailOAuthStartRequest {
  connector_id?: string;
  redirect_uri?: string;
}

export interface GmailOAuthStartResponse {
  consent_url: string;
  state: string;
}

export interface GmailOAuthCallbackRequest {
  code: string;
  state: string;
  connector_id?: string;
  redirect_uri?: string;
}

export interface GmailOAuthCallbackResponse {
  connector_id: string;
  connected: boolean;
  reauth_required: boolean;
  auth_state: Record<string, unknown>;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
}

export interface GmailLabelsResponse {
  labels: GmailLabel[];
}

export interface GmailSetLabelsRequest {
  label_ids: string[];
  consent_acknowledged: boolean;
}

export interface GmailSetLabelsResponse {
  connector_id: string;
  label_ids: string[];
  consent_acknowledged: boolean;
  auth_state: Record<string, unknown>;
}

// ── Phase 19 — Related communications (manual link) ──────────────

export interface RelatedThreadSummary {
  id: string;
  title: string;
  subject: string;
  message_count: number;
  last_message_at: string;
  gmail_thread_id: string;
  gmail_labels: string[];
}

export interface RelatedThreadListResponse {
  threads: RelatedThreadSummary[];
}

// ── Phase 18 — QuickBooks OAuth helpers ──────────────────────────

export interface QuickBooksAuthorizeRequest {
  connector_id?: string;
  redirect_uri?: string;
}

export interface QuickBooksAuthorizeResponse {
  consent_url: string;
  state: string;
}

export interface QuickBooksCallbackRequest {
  code: string;
  state: string;
  realmId: string;
  connector_id?: string;
  redirect_uri?: string;
}

export interface QuickBooksCallbackResponse {
  connector_id: string;
  realm_id: string;
  environment: string;
  connected: boolean;
  reauth_required: boolean;
  auth_state: Record<string, unknown>;
}

export type McpInstallTier =
  | 'direct_http'
  | 'http_with_auth'
  | 'stdio_package'
  | 'unsupported';

export interface McpRegistryAuthPrompt {
  name: string;
  description?: string;
  required?: boolean;
  is_secret?: boolean;
}

export interface McpRegistryManualRecipe {
  transport?: string;
  command?: string;
  args?: string[];
  package_registry?: string | null;
  package_identifier?: string | null;
  package_version?: string | null;
  note?: string | null;
}

export interface McpRegistryEntry {
  name: string;
  title: string;
  description?: string;
  version?: string;
  install_tier: McpInstallTier;
  install_allowed?: boolean;
  is_latest?: boolean;
  remote_url?: string | null;
  repository_url?: string | null;
  auth_header_prompts?: McpRegistryAuthPrompt[];
  env_var_prompts?: McpRegistryAuthPrompt[];
  manual_recipe?: McpRegistryManualRecipe | null;
}

export interface McpRegistrySearchResponse {
  entries: McpRegistryEntry[];
  next_cursor?: string | null;
  count: number;
}

export interface McpRegistryMountPreview {
  registry_name: string;
  registry_version?: string;
  install_tier: McpInstallTier;
  display_name: string;
  transport?: 'stdio' | 'streamable_http' | null;
  url?: string | null;
  command?: string | null;
  args?: string[];
  auth_header_prompts?: McpRegistryAuthPrompt[];
  env_var_prompts?: McpRegistryAuthPrompt[];
  manual_recipe?: McpRegistryManualRecipe | null;
  can_auto_mount?: boolean;
}

export interface MountMcpFromRegistryRequest {
  registry_name: string;
  secrets?: Record<string, string>;
}

export interface MountMcpConnectorRequest {
  /** Backend defaults to stdio; HTTP mounts must send streamable_http. */
  transport?: 'stdio' | 'streamable_http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  display_name?: string;
  registry_name?: string;
  registry_version?: string;
  label?: string;
  connection_mode?: ConnectionMode;
}

export const MCP_OAUTH_MESSAGE_TYPE = 'integral:mcp-oauth';

export interface McpMountResponse {
  status: 'mounted' | 'auth_required';
  connector: ConnectorResponse;
  authorization_url?: string | null;
}

export interface McpOAuthCallbackRequest {
  code: string;
  state: string;
}

/**
 * The connector health vocabulary, fixed by ADR-009 §8 and enforced on the
 * backend by `backend/tests/test_mcp_tool_spec_contract.py`. Typed as a union
 * rather than `string` because it was `string` that let the UI drift onto a
 * `'healthy'` value the backend never emits — every healthy MCP connector
 * rendered as grey `idle`, and a successful health probe toasted
 * "Unhealthy — ok" as an error. A union makes the next such drift a tsc error.
 */
export type McpHealthStatus = 'ok' | 'degraded' | 'error' | 'unknown';

export interface McpReauthorizeResponse {
  connector_id: string;
  consent_url: string;
  state: string;
}

export interface McpConnectorHealthResponse {
  connector_id: string;
  status: McpHealthStatus;
  last_error: string | null;
  last_health_at: string | null;
  tool_count: number;
}

export const connectorsApi = {
  async list(): Promise<ConnectorListResponse> {
    const { data } = await api.get<ConnectorListResponse>('/agentive/connectors');
    return data;
  },
  async listCatalog(): Promise<CatalogListResponse> {
    const { data } = await api.get<CatalogListResponse>(
      '/agentive/connectors/catalog',
    );
    return data;
  },
  async getCatalogEntry(slug: string): Promise<CatalogEntry> {
    const { data } = await api.get<CatalogEntry>(
      `/agentive/connectors/catalog/${encodeURIComponent(slug)}`,
    );
    return data;
  },
  async installFromCatalog(
    slug: string,
    body: CatalogInstallRequest = {},
  ): Promise<CatalogInstallResponse> {
    const { data } = await api.post<CatalogInstallResponse>(
      `/agentive/connectors/catalog/${encodeURIComponent(slug)}/install`,
      body,
    );
    return data;
  },
  /**
   * Restart OAuth on an EXISTING MCP connector.
   *
   * The alternative — installing from the catalog again — mints a new
   * connector node and orphans the dead one with its stale tool
   * registrations, so every reconnect used to leave a duplicate behind.
   */
  async reauthorizeMcp(id: string): Promise<McpReauthorizeResponse> {
    const { data } = await api.post<McpReauthorizeResponse>(
      `/agentive/connectors/${encodeURIComponent(id)}/mcp/reauthorize`,
    );
    return data;
  },
  async create(body: ConnectorCreate): Promise<ConnectorResponse> {
    const { data } = await api.post<ConnectorResponse>('/agentive/connectors', body);
    return data;
  },
  async mountMcp(body: MountMcpConnectorRequest): Promise<McpMountResponse> {
    const { data } = await api.post<McpMountResponse>(
      '/agentive/connectors/mcp/mount',
      body,
    );
    return data;
  },
  async mcpOAuthCallback(
    body: McpOAuthCallbackRequest,
  ): Promise<ConnectorResponse> {
    const { data } = await api.post<ConnectorResponse>(
      '/agentive/connectors/mcp/oauth/callback',
      body,
    );
    return data;
  },
  async searchMcpRegistry(params: {
    q?: string;
    cursor?: string;
    limit?: number;
  } = {}): Promise<McpRegistrySearchResponse> {
    const { data } = await api.get<McpRegistrySearchResponse>(
      '/agentive/connectors/mcp/registry/search',
      { params },
    );
    return data;
  },
  async getMcpRegistryServer(name: string): Promise<McpRegistryEntry> {
    const { data } = await api.get<McpRegistryEntry>(
      '/agentive/connectors/mcp/registry/servers',
      { params: { name } },
    );
    return data;
  },
  async previewMcpRegistryMount(name: string): Promise<McpRegistryMountPreview> {
    const { data } = await api.get<McpRegistryMountPreview>(
      '/agentive/connectors/mcp/registry/preview',
      { params: { name } },
    );
    return data;
  },
  async mountFromRegistry(
    body: MountMcpFromRegistryRequest,
  ): Promise<ConnectorResponse> {
    const { data } = await api.post<ConnectorResponse>(
      '/agentive/connectors/mcp/registry/mount',
      body,
    );
    return data;
  },
  async refreshMcp(id: string): Promise<ConnectorResponse> {
    const { data } = await api.post<ConnectorResponse>(
      `/agentive/connectors/${id}/mcp/refresh`,
    );
    return data;
  },
  async health(id: string): Promise<McpConnectorHealthResponse> {
    const { data } = await api.get<McpConnectorHealthResponse>(
      `/agentive/connectors/${id}/health`,
    );
    return data;
  },
  async listTools(id: string): Promise<ConnectorToolsResponse> {
    const { data } = await api.get<ConnectorToolsResponse>(
      `/agentive/connectors/${id}/tools`,
    );
    return data;
  },
  async patch(id: string, body: ConnectorUpdate): Promise<ConnectorResponse> {
    const { data } = await api.patch<ConnectorResponse>(
      `/agentive/connectors/${id}`,
      body,
    );
    return data;
  },
  async delete(id: string): Promise<void> {
    await api.delete(`/agentive/connectors/${id}`);
  },
  async sync(id: string): Promise<SyncStats> {
    const { data } = await api.post<SyncStats>(`/connectors/${id}/sync`);
    return data;
  },
  async listBindings(connectorId: string): Promise<ConnectorBindingListResponse> {
    const { data } = await api.get<ConnectorBindingListResponse>(
      `/agentive/connectors/${connectorId}/bindings`,
    );
    return data;
  },
  async createBinding(
    connectorId: string,
    body: CreateConnectorBindingBody,
  ): Promise<ConnectorBinding> {
    const { data } = await api.post<ConnectorBinding>(
      `/agentive/connectors/${connectorId}/bindings`,
      body,
    );
    return data;
  },
  async deleteBinding(connectorId: string, trackId: string): Promise<void> {
    await api.delete(`/agentive/connectors/${connectorId}/bindings/${trackId}`);
  },

  // Phase 19 — Gmail OAuth handshake + label selection.
  async gmailOauthStart(
    body: GmailOAuthStartRequest = {},
  ): Promise<GmailOAuthStartResponse> {
    const { data } = await api.post<GmailOAuthStartResponse>(
      '/agentive/connectors/gmail/oauth/start',
      body,
    );
    return data;
  },
  async gmailOauthCallback(
    body: GmailOAuthCallbackRequest,
  ): Promise<GmailOAuthCallbackResponse> {
    const { data } = await api.post<GmailOAuthCallbackResponse>(
      '/agentive/connectors/gmail/oauth/callback',
      body,
    );
    return data;
  },
  async gmailLabels(connectorId: string): Promise<GmailLabelsResponse> {
    const { data } = await api.get<GmailLabelsResponse>(
      `/agentive/connectors/${connectorId}/gmail/labels`,
    );
    return data;
  },
  async gmailSetLabels(
    connectorId: string,
    body: GmailSetLabelsRequest,
  ): Promise<GmailSetLabelsResponse> {
    const { data } = await api.post<GmailSetLabelsResponse>(
      `/agentive/connectors/${connectorId}/gmail/labels`,
      body,
    );
    return data;
  },

  // Phase 30 (DR-30-02) — manual related-communications link via the
  // generic /api/entries/{id}/related surface. The URL changed; the
  // call sites in RelatedCommunications.tsx are unaffected.
  async listRelatedCommunications(
    entryId: string,
  ): Promise<RelatedThreadListResponse> {
    const { data } = await api.get<RelatedThreadListResponse>(
      `/entries/${entryId}/related`,
      { params: { relation: 'related_communications' } },
    );
    return data;
  },
  async linkRelatedCommunication(
    entryId: string,
    threadId: string,
  ): Promise<{ status: string; entry_id: string; source_id: string; relation: string }> {
    const { data } = await api.post(
      `/entries/${entryId}/related/link`,
      { source_id: threadId, relation: 'related_communications' },
    );
    return data;
  },
  async unlinkRelatedCommunication(
    entryId: string,
    threadId: string,
  ): Promise<{ removed: number }> {
    const { data } = await api.delete(
      `/entries/${entryId}/related/${threadId}`,
      { params: { relation: 'related_communications' } },
    );
    return data;
  },

  // Phase 18 — QuickBooks OAuth handshake.
  async quickbooksAuthorize(
    body: QuickBooksAuthorizeRequest = {},
  ): Promise<QuickBooksAuthorizeResponse> {
    const { data } = await api.post<QuickBooksAuthorizeResponse>(
      '/agentive/connectors/quickbooks/authorize',
      body,
    );
    return data;
  },
  async quickbooksCallback(
    body: QuickBooksCallbackRequest,
  ): Promise<QuickBooksCallbackResponse> {
    const { data } = await api.post<QuickBooksCallbackResponse>(
      '/agentive/connectors/quickbooks/callback',
      body,
    );
    return data;
  },
};
