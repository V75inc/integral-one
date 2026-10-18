import type { CatalogEntry, ConnectorResponse } from '../../../api/connectors';
import { hostFromUrl, mcpConnectorDetails } from './mcpConnectorDetails';

export type ConnectorOrigin = 'library' | 'registry' | 'custom';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Endpoint, command, or native adapter label for a catalog card. */
export function catalogPackageSource(entry: CatalogEntry): string {
  if (entry.kind === 'mcp') {
    if (entry.transport === 'stdio' || entry.command) {
      return [entry.command, ...(entry.args ?? [])].filter(Boolean).join(' ');
    }
    if (entry.url) return hostFromUrl(entry.url);
    return 'MCP';
  }
  return 'Integral AI';
}

export function connectedConnectorOrigin(connector: ConnectorResponse): {
  origin: ConnectorOrigin;
  label: string;
  detail: string;
} {
  const auth = asRecord(connector.auth_state) ?? {};
  const catalogSlug =
    (typeof auth.catalog_slug === 'string' && auth.catalog_slug.trim()) ||
    '';
  const registry = asRecord(auth.registry);
  const registryName =
    typeof registry?.name === 'string' ? registry.name.trim() : '';
  const isMcp =
    connector.subclass_slug === 'mcp' || connector.kind === 'mcp';
  const mcpDetail = isMcp ? mcpConnectorDetails(connector).endpoint : '';

  if (catalogSlug) {
    return {
      origin: 'library',
      label: 'Library',
      detail: isMcp ? mcpDetail : 'Integral AI',
    };
  }
  if (registryName) {
    return {
      origin: 'registry',
      label: 'MCP Registry',
      detail: mcpDetail || registryName,
    };
  }
  if (isMcp) {
    return { origin: 'custom', label: 'Custom', detail: mcpDetail };
  }
  if (connector.subclass_slug) {
    return {
      origin: 'library',
      label: 'Library',
      detail: 'Integral AI',
    };
  }
  return { origin: 'custom', label: 'Custom', detail: connector.kind };
}
