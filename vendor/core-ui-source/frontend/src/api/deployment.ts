import axios from 'axios';
import { getApiBaseURL } from '../config';
import type { SessionPolicy } from './sessionPolicy';

export interface DeploymentCapabilities {
  session_policy?: SessionPolicy;
  profile: 'server' | 'desktop_single_user';
  identity: 'account' | 'local_owner';
  runtime?: { contract_version: 1; preset: 'local' | 'hosted'; identity: 'installation_owner' | 'accounts'; workspace_kinds: string[] };
  features: { collaboration: boolean; public_sharing: boolean; organization_workspaces: boolean; app_extensions: boolean; app_authoring: boolean; manual_records: boolean };
}

let pending: Promise<DeploymentCapabilities> | undefined;

/** Public, deployment-wide metadata shared by session boot and UI capabilities.
 * Keep this outside authenticated interceptors: boot cannot depend on renewal.
 * A successful response is stable for this page lifetime; failures can retry.
 */
export function loadDeploymentMetadata(): Promise<DeploymentCapabilities> {
  if (!pending) {
    pending = axios.get<DeploymentCapabilities>(`${getApiBaseURL()}/meta/deployment`, { timeout: 5000 })
      .then(response => response.data)
      .catch(error => { pending = undefined; throw error; });
  }
  return pending;
}
