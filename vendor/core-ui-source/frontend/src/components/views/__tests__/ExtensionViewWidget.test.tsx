import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { extensionsApi } from '../../../api/extensions';

const scopeState = vi.hoisted(() => ({ workspaceId: 'ws-1' }));

vi.mock('../../../api/extensions', () => ({
  extensionsApi: {
    handshake: vi.fn(async () => ({
      handshake_token: 'tok',
      package_version: '1.0.0',
      theme: {},
    })),
  },
}));

vi.mock('../../../context/ScopeContext', () => ({
  useScope: () => ({ scope: scopeState }),
}));

vi.mock('../../extensions/AppExtensionViewHost', () => ({
  AppExtensionViewHost: (props: {
    appId: string;
    viewKey: string;
    onDraftPatch?: unknown;
    onError: () => void;
  }) => (
    <><div
      data-testid="ext-host"
      data-has-draft-patch={props.onDraftPatch ? '1' : '0'}
    >
      {props.appId}:{props.viewKey}
    </div><button onClick={props.onError}>Fail host</button></>
  ),
}));

import { ExtensionViewWidget } from '../ExtensionViewWidget';
import {
  ContributionLifecycleContext,
  type ContributionLifecycleApi,
} from '../../entries/contributionLifecycle';
import type { SavedView } from '../../../types';

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(ui, {
    wrapper: ({ children }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>,
  });
}

describe('ExtensionViewWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopeState.workspaceId = 'ws-1';
  });

  it('falls back to __bindings.appId when track.app is missing (document shell)', async () => {
    const view = {
      id: 'v1',
      type: 'extension_view',
      track_id: 'track-1',
      name: 'Payments',
      config: {
        extension_view_key: 'invoice_payment_panel',
        __bindings: { appId: 'app-finance', entryId: 'entry-1', trackId: 'track-1' },
      },
    } as unknown as SavedView;

    wrap(
      <ExtensionViewWidget
        view={view}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => undefined}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ext-host').textContent).toBe(
        'app-finance:invoice_payment_panel',
      );
    });
  });

  it('forwards lifecycle onDraftPatch into AppExtensionViewHost', async () => {
    const onDraftPatch = vi.fn();
    const lifecycle: ContributionLifecycleApi = {
      mode: 'detail',
      placement: 'entry_detail',
      entryId: 'entry-1',
      trackId: 'track-1',
      appId: 'app-finance',
      customFields: { balance: 100, status: 'open' },
      onDraftPatch,
      register: () => () => undefined,
    };
    const view = {
      id: 'v1',
      type: 'extension_view',
      track_id: 'track-1',
      name: 'Payments',
      config: {
        extension_view_key: 'invoice_payment_panel',
        __bindings: { appId: 'app-finance', entryId: 'entry-1' },
      },
    } as unknown as SavedView;

    wrap(
      <ContributionLifecycleContext.Provider value={lifecycle}>
        <ExtensionViewWidget
          view={view}
          entries={[]}
          isLoading={false}
          onEntryOpen={() => undefined}
        />
      </ContributionLifecycleContext.Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('ext-host').getAttribute('data-has-draft-patch')).toBe(
        '1',
      );
    });
  });

  it('shows fallback when app and view key are both missing', () => {
    const view = {
      id: 'v1',
      type: 'extension_view',
      track_id: 'track-1',
      name: 'Broken',
      config: {},
    } as unknown as SavedView;

    wrap(
      <ExtensionViewWidget
        view={view}
        entries={[]}
        isLoading={false}
        onEntryOpen={() => undefined}
      />,
    );

    expect(
      screen.getByText(/missing app or view key metadata/i),
    ).toBeInTheDocument();
  });

  it.each(['view', 'app', 'workspace'])('does not carry a host failure into another %s', async identity => {
    const view = { id: 'v1', type: 'extension_view', name: 'Panel', config: {
      extension_view_key: 'panel-a', __bindings: { appId: 'app-a' },
    }} as unknown as SavedView;
    const widget = (next: SavedView) => <ExtensionViewWidget view={next} entries={[]} isLoading={false} onEntryOpen={() => undefined} />;
    const result = wrap(widget(view));
    await screen.findByTestId('ext-host');
    fireEvent.click(screen.getByRole('button', { name: 'Fail host' }));
    expect(screen.getByText('Extension view unavailable')).toBeInTheDocument();
    const next = { ...view, config: { ...view.config } };
    if (identity === 'view') next.config.extension_view_key = 'panel-b';
    if (identity === 'app') next.config.__bindings = { appId: 'app-b' };
    if (identity === 'workspace') scopeState.workspaceId = 'ws-2';
    result.rerender(widget(next));
    await screen.findByTestId('ext-host');
    expect(screen.queryByText('Extension view unavailable')).not.toBeInTheDocument();
  });

  it('renews the handshake and remounts a failed host on explicit retry', async () => {
    const view = { id: 'v1', type: 'extension_view', name: 'Panel', config: {
      extension_view_key: 'panel-a', __bindings: { appId: 'app-a' },
    }} as unknown as SavedView;
    wrap(<ExtensionViewWidget view={view} entries={[]} isLoading={false} onEntryOpen={() => undefined} />);
    await screen.findByTestId('ext-host');
    fireEvent.click(screen.getByRole('button', { name: 'Fail host' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry view' }));
    await screen.findByTestId('ext-host');
    expect(extensionsApi.handshake).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Extension view unavailable')).not.toBeInTheDocument();
  });

});
