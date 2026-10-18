import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { McpToolsInspector } from '../McpToolsInspector';
import type { ConnectorResponse } from '../../../../api/connectors';

function makeMcpConnector(
  tools: Array<{
    name: string;
    description?: string;
    input_schema?: Record<string, unknown>;
  }>,
): ConnectorResponse {
  return {
    id: 'mcp-1',
    kind: 'mcp',
    owner: 'u-1',
    auth_state: {
      display_name: 'QuickBooks MCP',
      transport: 'stdio',
      command: 'npx',
      discovered_tools: tools,
    },
    sync_cursor: null,
    mapping_profile: null,
    permissions: [],
    capabilities: [],
    conflict_policy: null,
    subclass_slug: 'mcp',
    sync_interval_seconds: 300,
    last_synced_at: null,
    health_status: 'ok',
    created_at: '2026-05-17T00:00:00Z',
    updated_at: '2026-05-17T00:00:00Z',
  };
}

afterEach(() => {
  cleanup();
});

describe('<McpToolsInspector />', () => {
  it('lists every tool and filters by name or description', () => {
    render(
      <McpToolsInspector
        connector={makeMcpConnector([
          {
            name: 'get_customer',
            description: 'Fetch a customer by id',
            input_schema: {
              type: 'object',
              required: ['customer_id'],
              properties: {
                customer_id: { type: 'string', description: 'QBO customer id' },
                include: { type: 'boolean' },
              },
            },
          },
          { name: 'search_invoices', description: 'Find invoices by date' },
        ])}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'QuickBooks MCP tools' });
    const list = within(dialog).getByTestId('mcp-tools-inspector-list');
    expect(within(list).getByText('get_customer')).toBeInTheDocument();
    expect(within(list).getByText('search_invoices')).toBeInTheDocument();
    expect(within(dialog).getByText(/2 tools/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Search tools for QuickBooks MCP'), {
      target: { value: 'invoice' },
    });
    expect(within(list).queryByText('get_customer')).not.toBeInTheDocument();
    expect(within(list).getByText('search_invoices')).toBeInTheDocument();
    expect(within(dialog).getByText(/1 of 2 tools/i)).toBeInTheDocument();
  });

  it('expands a tool to show description and parameters', () => {
    render(
      <McpToolsInspector
        connector={makeMcpConnector([
          {
            name: 'get_customer',
            description: 'Fetch a customer by id',
            input_schema: {
              type: 'object',
              required: ['customer_id'],
              properties: {
                customer_id: { type: 'string', description: 'QBO customer id' },
              },
            },
          },
        ])}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /get_customer/i }));
    expect(screen.getByText('customer_id')).toBeInTheDocument();
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getByText('QBO customer id')).toBeInTheDocument();
  });
});
