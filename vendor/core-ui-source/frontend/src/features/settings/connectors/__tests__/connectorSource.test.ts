import { describe, expect, it } from 'vitest';

import type { CatalogEntry, ConnectorResponse } from '../../../../api/connectors';
import {
  catalogPackageSource,
  connectedConnectorOrigin,
} from '../connectorSource';

function catalog(overrides: Partial<CatalogEntry>): CatalogEntry {
  return {
    slug: 'notion',
    display_name: 'Notion',
    description: '',
    category: 'mcp_server',
    kind: 'mcp',
    icon: 'notion',
    vetted: true,
    auth: { type: 'none', fields: [] },
    ...overrides,
  };
}

function connector(
  overrides: Partial<ConnectorResponse> = {},
): ConnectorResponse {
  return {
    id: 'con-1',
    kind: 'custom',
    owner: 'u-1',
    auth_state: {},
    sync_cursor: null,
    mapping_profile: null,
    permissions: [],
    capabilities: [],
    conflict_policy: 'last_write_wins',
    subclass_slug: 'gmail',
    sync_interval_seconds: 300,
    last_synced_at: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

describe('catalogPackageSource', () => {
  it('shows the HTTP host for hosted MCP servers', () => {
    expect(
      catalogPackageSource(
        catalog({ url: 'https://mcp.notion.com/mcp', transport: 'streamable_http' }),
      ),
    ).toBe('mcp.notion.com/mcp');
  });

  it('shows command and args for stdio packages', () => {
    expect(
      catalogPackageSource(
        catalog({
          slug: 'quickbooks_mcp',
          category: 'mcp_package',
          transport: 'stdio',
          command: 'npx',
          args: ['-y', 'github:intuit/quickbooks-online-mcp-server'],
        }),
      ),
    ).toBe('npx -y github:intuit/quickbooks-online-mcp-server');
  });

  it('labels native adapters as Integral AI', () => {
    expect(
      catalogPackageSource(
        catalog({
          slug: 'gmail',
          kind: 'sync',
          category: 'native',
          url: undefined,
          command: undefined,
        }),
      ),
    ).toBe('Integral AI');
  });
});

describe('connectedConnectorOrigin', () => {
  it('marks catalog installs as Library', () => {
    const origin = connectedConnectorOrigin(
      connector({
        kind: 'mcp',
        subclass_slug: 'mcp',
        auth_state: {
          catalog_slug: 'notion',
          url: 'https://mcp.notion.com/mcp',
          transport: 'streamable_http',
        },
      }),
    );
    expect(origin).toEqual({
      origin: 'library',
      label: 'Library',
      detail: 'mcp.notion.com/mcp',
    });
  });

  it('marks registry mounts as MCP Registry', () => {
    const origin = connectedConnectorOrigin(
      connector({
        kind: 'mcp',
        subclass_slug: 'mcp',
        auth_state: {
          url: 'https://mcp.firecrawl.dev/mcp',
          transport: 'streamable_http',
          registry: { name: 'io.github.firecrawl/firecrawl-mcp-server' },
        },
      }),
    );
    expect(origin.label).toBe('MCP Registry');
    expect(origin.origin).toBe('registry');
    expect(origin.detail).toBe('mcp.firecrawl.dev/mcp');
  });

  it('marks URL mounts without catalog or registry as Custom', () => {
    const origin = connectedConnectorOrigin(
      connector({
        kind: 'mcp',
        subclass_slug: 'mcp',
        conflict_policy: null,
        auth_state: {
          display_name: 'Acme MCP',
          url: 'https://mcp.acme.example/mcp',
          transport: 'streamable_http',
        },
      }),
    );
    expect(origin).toEqual({
      origin: 'custom',
      label: 'Custom',
      detail: 'mcp.acme.example/mcp',
    });
  });

  it('marks native adapters as Library', () => {
    expect(connectedConnectorOrigin(connector()).label).toBe('Library');
  });
});
