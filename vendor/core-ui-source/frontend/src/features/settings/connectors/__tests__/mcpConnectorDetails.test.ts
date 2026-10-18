import { describe, it, expect } from 'vitest';

import {
  hostFromUrl,
  mcpConnectorDetails,
  paramsFromInputSchema,
} from '../mcpConnectorDetails';
import type { ConnectorResponse } from '../../../../api/connectors';

function connector(
  auth_state: Record<string, unknown>,
): ConnectorResponse {
  return {
    id: 'mcp-1',
    kind: 'mcp',
    owner: 'u-1',
    auth_state,
    sync_cursor: null,
    mapping_profile: null,
    permissions: [],
    capabilities: [],
    conflict_policy: null,
    subclass_slug: 'mcp',
    sync_interval_seconds: 300,
    last_synced_at: null,
    created_at: null,
    updated_at: null,
  };
}

describe('mcpConnectorDetails', () => {
  it('parses discovered tools with descriptions and schemas', () => {
    const details = mcpConnectorDetails(
      connector({
        display_name: 'QuickBooks MCP',
        transport: 'stdio',
        command: 'npx',
        discovered_tools: [
          {
            name: 'get_customer',
            description: 'Fetch a customer',
            input_schema: {
              type: 'object',
              required: ['id'],
              properties: { id: { type: 'string' } },
            },
          },
        ],
      }),
    );
    expect(details.title).toBe('QuickBooks MCP');
    expect(details.transportLabel).toBe('stdio');
    expect(details.endpoint).toBe('npx');
    expect(details.tools).toEqual([
      {
        name: 'get_customer',
        description: 'Fetch a customer',
        inputSchema: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
    ]);
  });

  it('formats HTTP endpoints without a trailing slash', () => {
    expect(hostFromUrl('https://drivemcp.googleapis.com/mcp/v1/')).toBe(
      'drivemcp.googleapis.com/mcp/v1',
    );
  });
});

describe('paramsFromInputSchema', () => {
  it('lists required properties with types', () => {
    expect(
      paramsFromInputSchema({
        type: 'object',
        required: ['customer_id'],
        properties: {
          customer_id: { type: 'string', description: 'QBO id' },
          include: { type: 'boolean' },
        },
      }),
    ).toEqual([
      {
        name: 'customer_id',
        type: 'string',
        required: true,
        description: 'QBO id',
      },
      {
        name: 'include',
        type: 'boolean',
        required: false,
        description: '',
      },
    ]);
  });
});
