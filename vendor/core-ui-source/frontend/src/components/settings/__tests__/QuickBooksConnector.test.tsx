/**
 * Phase 18 QB-05 — QuickBooks connector UI smoke tests.
 *
 * Card: launches OAuth via connectorsApi.quickbooksAuthorize; never
 * renders raw tokens (the consent_url is rendered indirectly via
 * window.open, but the test asserts the popup call shape + that token
 * material never reaches the DOM).
 *
 * Settings: realm + environment + last_synced_at render; interval
 * input + save; sync now button + stats; Reconnect affordance shows
 * when auth_state.reauth_required is set.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../../api/connectors', () => ({
  connectorsApi: {
    quickbooksAuthorize: vi.fn(),
    quickbooksCallback: vi.fn(),
    sync: vi.fn(),
    patch: vi.fn(),
  },
}));

import { connectorsApi } from '../../../api/connectors';
import { QuickBooksConnectorCard } from '../QuickBooksConnectorCard';
import { QuickBooksConnectorSettings } from '../QuickBooksConnectorSettings';

const authorizeMock = connectorsApi.quickbooksAuthorize as unknown as ReturnType<typeof vi.fn>;
const callbackMock = connectorsApi.quickbooksCallback as unknown as ReturnType<typeof vi.fn>;
const syncMock = connectorsApi.sync as unknown as ReturnType<typeof vi.fn>;
const patchMock = connectorsApi.patch as unknown as ReturnType<typeof vi.fn>;


describe('QuickBooksConnectorCard', () => {
  beforeEach(() => {
    authorizeMock.mockReset();
    callbackMock.mockReset();
  });

  it('launches the OAuth popup via connectorsApi.quickbooksAuthorize', async () => {
    authorizeMock.mockResolvedValue({
      consent_url: 'https://appcenter.intuit.com/connect/oauth2?client_id=mock',
      state: 'signed-state.sig',
    });
    const winOpen = vi.spyOn(window, 'open').mockReturnValue(null as unknown as Window);

    render(<QuickBooksConnectorCard />);
    fireEvent.click(screen.getByTestId('quickbooks-connect-button'));
    await waitFor(() => expect(authorizeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(winOpen).toHaveBeenCalledTimes(1));
    expect(winOpen.mock.calls[0][0]).toContain('appcenter.intuit.com');
    winOpen.mockRestore();
  });

  it('never renders token material in the DOM (no access_token / refresh_token)', async () => {
    authorizeMock.mockResolvedValue({
      consent_url: 'https://appcenter.intuit.com/connect/oauth2?client_id=mock',
      state: 'signed-state.sig',
    });
    const winOpen = vi.spyOn(window, 'open').mockReturnValue(null as unknown as Window);
    const { container } = render(<QuickBooksConnectorCard />);
    fireEvent.click(screen.getByTestId('quickbooks-connect-button'));
    await waitFor(() => expect(authorizeMock).toHaveBeenCalled());
    const html = container.innerHTML;
    expect(html).not.toContain('access_token');
    expect(html).not.toContain('refresh_token');
    winOpen.mockRestore();
  });

  it('manual callback path posts to /callback and fires onConnected', async () => {
    callbackMock.mockResolvedValue({
      connector_id: 'conn-1',
      realm_id: 'realm-1',
      environment: 'sandbox',
      connected: true,
      reauth_required: false,
      auth_state: { realm_id: 'realm-1', environment: 'sandbox' },
    });
    const onConnected = vi.fn();
    render(<QuickBooksConnectorCard onConnected={onConnected} />);
    fireEvent.click(screen.getByTestId('quickbooks-manual-callback'));
    await waitFor(() => expect(callbackMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(onConnected).toHaveBeenCalledWith({
      connectorId: 'conn-1',
      realmId: 'realm-1',
      environment: 'sandbox',
    });
    expect(screen.getByTestId('quickbooks-connected')).toBeInTheDocument();
  });
});


describe('QuickBooksConnectorSettings', () => {
  beforeEach(() => {
    syncMock.mockReset();
    patchMock.mockReset();
  });

  const baseConnector = {
    id: 'conn-1',
    kind: 'custom' as const,
    owner: 'u-1',
    auth_state: {
      realm_id: 'realm-1',
      environment: 'sandbox',
    } as Record<string, unknown>,
    sync_cursor: null,
    mapping_profile: null,
    permissions: [],
    capabilities: [],
    conflict_policy: 'last_write_wins',
    subclass_slug: 'quickbooks',
    sync_interval_seconds: 600,
    last_synced_at: '2026-05-23T12:00:00Z',
    created_at: null,
    updated_at: null,
  };

  it('renders realm + environment + last-synced (no token material)', () => {
    const { container } = render(
      <QuickBooksConnectorSettings connector={baseConnector} />,
    );
    expect(screen.getByTestId('quickbooks-connector-settings')).toBeInTheDocument();
    expect(container.innerHTML).toContain('realm-1');
    expect(container.innerHTML).toContain('sandbox');
    expect(container.innerHTML).toContain('2026-05-23');
    expect(container.innerHTML).not.toContain('access_token');
    expect(container.innerHTML).not.toContain('refresh_token');
  });

  it('Sync now triggers connectorsApi.sync and displays last-sync stats', async () => {
    syncMock.mockResolvedValue({
      created: 3,
      updated: 1,
      conflict: 0,
      archived: 0,
      errors: [],
    });
    render(<QuickBooksConnectorSettings connector={baseConnector} />);
    fireEvent.click(screen.getByTestId('quickbooks-sync-now'));
    await waitFor(() => expect(syncMock).toHaveBeenCalledWith('conn-1'));
    await waitFor(() =>
      expect(screen.getByTestId('quickbooks-last-stats')).toBeInTheDocument(),
    );
  });

  it('Save interval triggers connectorsApi.patch with the new value', async () => {
    patchMock.mockResolvedValue({ ...baseConnector, sync_interval_seconds: 900 });
    render(<QuickBooksConnectorSettings connector={baseConnector} />);
    const input = screen.getByTestId('quickbooks-interval-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '900' } });
    fireEvent.click(screen.getByTestId('quickbooks-save-interval'));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('conn-1', {
        sync_interval_seconds: 900,
      }),
    );
  });

  it('renders the Reconnect affordance when auth_state.reauth_required is set', () => {
    render(
      <QuickBooksConnectorSettings
        connector={{
          ...baseConnector,
          auth_state: {
            ...baseConnector.auth_state,
            reauth_required: true,
          },
        }}
      />,
    );
    expect(screen.getByTestId('quickbooks-reconnect')).toBeInTheDocument();
    expect(screen.getByTestId('quickbooks-reconnect-button')).toBeInTheDocument();
  });
});
