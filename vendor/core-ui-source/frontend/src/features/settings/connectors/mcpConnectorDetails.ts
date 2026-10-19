import type { ConnectorResponse } from '../../../api/connectors';

export interface McpDiscoveredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown> | null;
  /** True when invoking needs a human bless. Shown as a badge. */
  write?: boolean | null;
}

export interface McpToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface McpConnectorDetails {
  title: string;
  registryName: string;
  version: string;
  endpoint: string;
  transportLabel: string;
  tools: McpDiscoveredTool[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function hostFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, '');
    return `${parsed.host}${path}`;
  } catch {
    return url;
  }
}

function schemaType(def: unknown): string {
  if (!def || typeof def !== 'object') return '';
  const row = def as Record<string, unknown>;
  if (typeof row.type === 'string') return row.type;
  if (Array.isArray(row.type)) {
    return row.type.filter((item): item is string => typeof item === 'string').join(' | ');
  }
  return '';
}

export function paramsFromInputSchema(
  schema: Record<string, unknown> | null,
): McpToolParam[] {
  if (!schema) return [];
  const props = asRecord(schema.properties);
  if (!props) return [];
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((item): item is string => typeof item === 'string')
      : [],
  );
  return Object.entries(props).map(([name, def]) => {
    const row = asRecord(def);
    return {
      name,
      type: schemaType(def),
      required: required.has(name),
      description:
        typeof row?.description === 'string' ? row.description.trim() : '',
    };
  });
}

export function mcpConnectorDetails(
  connector: ConnectorResponse,
): McpConnectorDetails {
  const auth = asRecord(connector.auth_state) ?? {};
  const registry = asRecord(auth.registry);
  const displayName =
    typeof auth.display_name === 'string' ? auth.display_name.trim() : '';
  const registryName =
    typeof registry?.name === 'string' ? registry.name.trim() : '';
  const version =
    typeof registry?.version === 'string' ? registry.version.trim() : '';
  const url = typeof auth.url === 'string' ? auth.url.trim() : '';
  const command = typeof auth.command === 'string' ? auth.command.trim() : '';
  const transport =
    typeof auth.transport === 'string' ? auth.transport.trim() : '';
  const rawTools = Array.isArray(auth.discovered_tools)
    ? auth.discovered_tools
    : [];
  const tools = rawTools
    .map(item => {
      const row = asRecord(item);
      const name = typeof row?.name === 'string' ? row.name.trim() : '';
      if (!name) return null;
      const description =
        typeof row?.description === 'string' ? row.description.trim() : '';
      const inputSchema = asRecord(row?.input_schema);
      return { name, description, inputSchema } satisfies McpDiscoveredTool;
    })
    .filter((item): item is McpDiscoveredTool => item !== null);
  const title =
    displayName || registryName || (url ? hostFromUrl(url) : '') || command || 'MCP server';
  const transportLabel =
    transport === 'stdio'
      ? 'stdio'
      : transport === 'streamable_http'
        ? 'HTTP'
        : transport || 'MCP';
  const endpoint = url ? hostFromUrl(url) : command;
  return { title, registryName, version, endpoint, transportLabel, tools };
}
