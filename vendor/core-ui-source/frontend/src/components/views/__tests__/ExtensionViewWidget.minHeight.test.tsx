import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach } from 'vitest';

vi.mock('../../../api/extensions', () => ({
  extensionsApi: {
    handshake: vi.fn(async () => ({ handshake_token: 'tok', package_version: '1.0.0', theme: {} })),
  },
}));

vi.mock('../../../context/ScopeContext', () => ({
  useScope: () => ({ scope: { workspaceId: 'ws-1' } }),
}));

vi.mock('../../extensions/AppExtensionViewHost', () => ({
  AppExtensionViewHost: (props: { minHeight?: number }) => (
    <div data-testid="ext-host" data-min-height={props.minHeight === undefined ? '' : String(props.minHeight)} />
  ),
}));

import { ExtensionViewWidget } from '../ExtensionViewWidget';
import type { SavedView } from '../../../types';

function viewWith(minHeight: unknown): SavedView {
  return {
    id: 'v1',
    type: 'extension_view',
    track_id: 'track-1',
    name: 'Panel',
    config: {
      extension_view_key: 'panel',
      ...(minHeight === undefined ? {} : { min_height: minHeight }),
      __bindings: { appId: 'app-1', entryId: 'entry-1', trackId: 'track-1' },
    },
  } as unknown as SavedView;
}

async function renderedMinHeight(minHeight: unknown): Promise<string> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ExtensionViewWidget view={viewWith(minHeight)} entries={[]} isLoading={false} onEntryOpen={() => undefined} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const host = await waitFor(() => screen.getByTestId('ext-host'));
  return host.getAttribute('data-min-height') ?? '';
}

describe('ExtensionViewWidget min_height', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

  it('passes a configured height through', async () => {
    expect(await renderedMinHeight(120)).toBe('120');
  });

  it('keeps the host default when nothing is configured', async () => {
    expect(await renderedMinHeight(undefined)).toBe('');
  });

  it('ignores values that are not positive numbers', async () => {
    expect(await renderedMinHeight('tall')).toBe('');
  });

  it('clamps very small and very large values', async () => {
    expect(await renderedMinHeight(10)).toBe('48');
    cleanup();
    expect(await renderedMinHeight(99999)).toBe('2400');
  });
});
