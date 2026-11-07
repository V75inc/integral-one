import apiClient from './client';

export type EmailProvider = 'resend' | 'sendgrid' | 'smtp';
export interface EmailConfiguration {
  provider: EmailProvider;
  from_email: string;
  from_name: string;
  reply_to: string;
  smtp_host: string;
  smtp_port: 465 | 587;
  smtp_username: string;
  smtp_tls: 'starttls' | 'implicit';
  api_key?: string | null;
  smtp_password?: string | null;
  webhook_key?: string | null;
}
export interface RedactedEmailConfiguration extends Omit<EmailConfiguration, 'api_key' | 'smtp_password' | 'webhook_key'> {
  connection_id: string;
  api_key_configured: boolean;
  smtp_password_configured: boolean;
  webhook_key_configured: boolean;
  tracking_available: boolean;
  tracking_configured: boolean;
  webhook_url: string | null;
}
export interface WorkspaceEmailSettings {
  workspace_id: string;
  available: boolean;
  platform_delivery_configured: boolean;
  revision: number;
  tested_revision: number | null;
  mode: 'custom' | 'platform';
  draft: RedactedEmailConfiguration | null;
  active: RedactedEmailConfiguration | null;
}
export interface EmailHistoryItem {
  message_id: string;
  to: string;
  subject: string;
  source_kind: string;
  provider: EmailProvider;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string | null;
}
export interface EmailHistory {
  items: EmailHistoryItem[];
  next_cursor: string | null;
}
// Pin each operation to the workspace represented by this form. A global
// scope switch must not redirect an in-flight mutation to the next workspace.
const scope = (workspace: string) => ({ headers: { 'X-Integral-Scope': `ws:${workspace}` } });
export const workspaceEmailApi = {
  get: (workspace: string) => apiClient.get<WorkspaceEmailSettings>('/workspace/email', scope(workspace)).then(r => r.data),
  save: (workspace: string, revision: number, configuration: EmailConfiguration) => apiClient.put<WorkspaceEmailSettings>('/workspace/email/draft', { expected_revision: revision, configuration }, scope(workspace)).then(r => r.data),
  test: (workspace: string, revision: number, to?: string) => apiClient.post<{ status: string; message: string }>('/workspace/email/test', { expected_revision: revision, to }, scope(workspace)).then(r => r.data),
  activate: (workspace: string, revision: number) => apiClient.post<WorkspaceEmailSettings>('/workspace/email/activate', { expected_revision: revision }, scope(workspace)).then(r => r.data),
  disable: (workspace: string, revision: number) => apiClient.post<WorkspaceEmailSettings>('/workspace/email/disable', { expected_revision: revision }, scope(workspace)).then(r => r.data),
  history: (workspace: string, cursor = '') => apiClient.get<EmailHistory>('/workspace/email/history', { ...scope(workspace), params: { cursor } }).then(r => r.data),
};
