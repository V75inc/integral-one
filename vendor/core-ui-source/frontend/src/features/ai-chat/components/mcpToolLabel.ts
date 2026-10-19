/**
 * Human label for a mounted MCP tool call.
 *
 * Remote tools register as `mcp__<connector-short-id>__<remote_name>` (see
 * `mcp_mount.tool_key_for`), and the chat surface rendered that key verbatim:
 * "Used tool: mcp__0123456789ab__search_files". The user could not tell which
 * third party had just been contacted — which is the one thing they most need
 * to know about a call that leaves the workspace.
 */
import type { ConnectorResponse } from '../../../api/connectors';

const MCP_TOOL_PATTERN = /^mcp__([A-Za-z0-9_]+)__(.+)$/;

export interface McpToolLabel {
  /** The remote tool's own name, e.g. `search_files`. */
  remoteName: string;
  /** Display name of the connector it belongs to, when resolvable. */
  connectorName: string;
}

/** Parse a registered tool key, or null when it is not a mounted MCP tool. */
export function parseMcpToolName(
  toolName: string,
): { shortId: string; remoteName: string } | null {
  const match = MCP_TOOL_PATTERN.exec(toolName || '');
  if (!match) return null;
  return { shortId: match[1], remoteName: match[2] };
}

/**
 * Resolve `toolName` against the caller's connectors.
 *
 * Matching is by prefix because the key carries a truncated, sanitized form of
 * the connector's node id.
 */
export function mcpToolLabel(
  toolName: string,
  connectors: ConnectorResponse[] | undefined,
  displayNameOf: (c: ConnectorResponse) => string,
): McpToolLabel | null {
  const parsed = parseMcpToolName(toolName);
  if (!parsed) return null;
  const match = (connectors ?? []).find(c => {
    const tail = (c.id || '').split('.').pop() ?? '';
    return tail.replace(/[^A-Za-z0-9_]+/g, '_').startsWith(parsed.shortId);
  });
  return {
    remoteName: parsed.remoteName,
    connectorName: match ? displayNameOf(match) : '',
  };
}

/** One-line rendering: `search_files on Google Drive`. */
export function formatMcpToolLabel(label: McpToolLabel): string {
  return label.connectorName
    ? `${label.remoteName} on ${label.connectorName}`
    : `${label.remoteName} (external MCP server)`;
}
