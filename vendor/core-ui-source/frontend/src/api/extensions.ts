import apiClient from './client';

export interface ExtensionViewDescriptor {
  key: string;
  name: string;
  description?: string;
  entry: string;
  scope?: string;
  props_schema?: Record<string, unknown>;
}

export interface ExtensionViewsListResponse {
  app_id: string;
  package_version?: string;
  views: ExtensionViewDescriptor[];
  handshake_token: string;
  protocol: string;
}

export interface ExtensionViewHandshakeResponse {
  app_id: string;
  view_key: string;
  package_version?: string;
  handshake_token: string;
  protocol: string;
  theme?: Record<string, unknown>;
}

export interface AppOperationAvailableResponse {
  app_id: string;
  operation_key: string;
  output: Record<string, unknown>;
  receipt?: Record<string, unknown> | null;
  object_refs?: Array<Record<string, unknown>>;
  evidence?: Record<string, unknown>;
  output_disposition?: 'available';
  current_state_verified?: false;
  operation_receipt?: RecordedOperationReceipt | null;
}

export interface RecordedOperationReceipt {
  id: string;
  status: 'succeeded';
  replayed: boolean;
}

export interface AppOperationWithheldResponse {
  output_disposition: 'withheld';
  current_state_verified: false;
  operation_receipt: RecordedOperationReceipt & { replayed: true };
}

export type AppOperationInvokeResponse = AppOperationAvailableResponse | AppOperationWithheldResponse;

export const RECORDED_OUTPUT_WITHHELD_MESSAGE =
  'This action completed earlier. Its saved result is unavailable; current records have not been verified.';

export function isRecordedOutputWithheld(value: unknown): value is AppOperationWithheldResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const receipt = result.operation_receipt as Record<string, unknown> | undefined;
  return result.output_disposition === 'withheld' && result.current_state_verified === false &&
    Boolean(receipt && typeof receipt.id === 'string' &&
      /^o\.OperationExecutionReceipt\.[0-9a-f]{64}$/.test(receipt.id) &&
      receipt.status === 'succeeded' && receipt.replayed === true);
}

/** Stop output consumers from treating withheld completion as empty data. */
export class RecordedOperationOutputWithheld extends Error {
  readonly retryable = false;
  constructor(readonly operationReceipt: RecordedOperationReceipt) {
    super(RECORDED_OUTPUT_WITHHELD_MESSAGE);
    this.name = 'RecordedOperationOutputWithheld';
  }
}

export function requireOperationOutput(result: AppOperationInvokeResponse): AppOperationAvailableResponse {
  if (result.output_disposition === 'withheld') {
    throw new RecordedOperationOutputWithheld(result.operation_receipt);
  }
  return result;
}

export type ExtensionNavigationTarget = { kind: 'app' | 'track' | 'entry' | 'dashboard'; id: string };

export const extensionsApi = {
  async listOperations(appId: string): Promise<{ operations: Array<{ key: string; allowed?: boolean }> }> {
    const { data } = await apiClient.get(`/extensions/${appId}/operations`);
    return data;
  },
  async resolveNavigation(appId: string, target: ExtensionNavigationTarget): Promise<{ path: string }> {
    const { data } = await apiClient.post(`/extensions/${appId}/navigate`, target);
    return data;
  },
  async listViews(appId: string, viewKey?: string): Promise<ExtensionViewsListResponse> {
    const params = viewKey ? { view_key: viewKey } : undefined;
    const { data } = await apiClient.get<ExtensionViewsListResponse>(
      `/extensions/${appId}/views`,
      { params },
    );
    return data;
  },

  async handshake(
    appId: string,
    viewKey: string,
  ): Promise<ExtensionViewHandshakeResponse> {
    const { data } = await apiClient.get<ExtensionViewHandshakeResponse>(
      `/extensions/${appId}/views/${encodeURIComponent(viewKey)}/handshake`,
    );
    return data;
  },

  async invokeOperation(
    appId: string,
    operationKey: string,
    payload: Record<string, unknown> = {},
    idempotencyKey?: string,
  ): Promise<AppOperationInvokeResponse> {
    const headers: Record<string, string> = {
      'X-Integral-Run-Origin': 'view',
    };
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }
    const { data } = await apiClient.post<AppOperationInvokeResponse>(
      `/extensions/${appId}/operations/${encodeURIComponent(operationKey)}`,
      { input: payload },
      { headers },
    );
    return data;
  },

  async listCapabilities(includePaused = false) {
    const { data } = await apiClient.get<{
      workspace_id: string;
      generation_id: string;
      capabilities: Array<Record<string, unknown>>;
    }>('/capabilities', {
      params: includePaused ? { include_paused: true } : undefined,
    });
    return data;
  },

  async invokeQuery(
    appId: string,
    queryKey: string,
    params: Record<string, unknown> = {},
  ) {
    const { data } = await apiClient.post<Record<string, unknown>>(
      `/extensions/${appId}/queries/${encodeURIComponent(queryKey)}`,
      { params },
    );
    return data;
  },

  async governedQuery(query: Record<string, unknown>) {
    const { data } = await apiClient.post<Record<string, unknown>>('/query', {
      query,
    });
    return data;
  },
};
