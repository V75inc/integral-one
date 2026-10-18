/**
 * Phase 18 QB-05 — QuickBooks connector card.
 *
 * Replaces the generic raw-JSON ``auth_state`` form for the QuickBooks
 * connector. Launches the Intuit OAuth consent flow in a popup; the
 * popup posts ``code``/``state``/``realmId`` back via the callback
 * endpoint, which persists tokens server-side.
 *
 * Tokens are NEVER rendered or stored client-side — the only visible
 * status comes from ``connected``/``environment``/``realm_id`` on the
 * callback response.
 */

import { useCallback, useState } from 'react';
import { connectorsApi } from '../../api/connectors';
import { Text } from '../../ui';

export interface QuickBooksConnectorCardProps {
  connectorId?: string;
  onConnected?: (result: {
    connectorId: string;
    realmId: string;
    environment: string;
  }) => void;
}

type Status = 'idle' | 'pending' | 'connected' | 'error';

export function QuickBooksConnectorCard({
  connectorId,
  onConnected,
}: QuickBooksConnectorCardProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [connectedInfo, setConnectedInfo] = useState<{
    realmId: string;
    environment: string;
  } | null>(null);

  const launchOAuth = useCallback(async () => {
    setStatus('pending');
    setErrorMessage('');
    try {
      const { consent_url } = await connectorsApi.quickbooksAuthorize({
        connector_id: connectorId,
      });
      // Open Intuit consent flow in a popup. The redirect page on our
      // origin re-posts to /agentive/connectors/quickbooks/callback with
      // {code, state, realmId} and then closes itself. The
      // ``onConnected`` callback should be re-fired from the page-level
      // listener once the callback completes.
      window.open(
        consent_url,
        'quickbooks-oauth',
        'width=600,height=720,noopener=no,scrollbars=yes',
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'QuickBooks authorize failed';
      setStatus('error');
      setErrorMessage(message);
    }
  }, [connectorId]);

  // Test seam — exposed for the smoke test to assert the callback path.
  const handleManualCallback = useCallback(
    async (code: string, state: string, realmId: string) => {
      setStatus('pending');
      setErrorMessage('');
      try {
        const cb = await connectorsApi.quickbooksCallback({
          code,
          state,
          realmId,
          connector_id: connectorId,
        });
        setStatus('connected');
        setConnectedInfo({
          realmId: cb.realm_id,
          environment: cb.environment,
        });
        onConnected?.({
          connectorId: cb.connector_id,
          realmId: cb.realm_id,
          environment: cb.environment,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'QuickBooks callback failed';
        setStatus('error');
        setErrorMessage(message);
      }
    },
    [connectorId, onConnected],
  );

  return (
    <div
      data-testid="quickbooks-connector-card"
      className="rounded-md border border-[var(--panel-border)] p-4"
    >
      <Text variant="heading-sm">Connect QuickBooks</Text>
      <Text variant="meta" as="p" className="mt-1">
        Mirror QuickBooks Online (Invoices, Expenses, Customers, Vendors, Bills)
        into Integral. Tokens never display in the UI.
      </Text>

      {status === 'connected' && connectedInfo ? (
        <div className="mt-3" data-testid="quickbooks-connected">
          <Text variant="meta" tone="muted">
            Connected — realm {connectedInfo.realmId} ({connectedInfo.environment})
          </Text>
        </div>
      ) : (
        <button
          type="button"
          onClick={launchOAuth}
          disabled={status === 'pending'}
          className="mt-3 rounded-md border border-[var(--panel-border)] px-3 py-1.5 hover:opacity-80"
          data-testid="quickbooks-connect-button"
        >
          <Text variant="meta">
            {status === 'pending' ? 'Connecting…' : 'Connect QuickBooks'}
          </Text>
        </button>
      )}

      {status === 'error' && errorMessage ? (
        <Text
          variant="meta"
          tone="default"
          as="p"
          className="mt-2"
        >
          {errorMessage}
        </Text>
      ) : null}

      {/* Test seam — manual callback hook surfaced as a hidden button
          so the test can assert callback behaviour without a real popup
          round-trip. Hidden from end users via aria-hidden + sr-only. */}
      <button
        type="button"
        onClick={() =>
          handleManualCallback('mock-code', 'mock-state', 'mock-realm-id')
        }
        className="sr-only"
        aria-hidden
        data-testid="quickbooks-manual-callback"
      >
        manual callback (test only)
      </button>
    </div>
  );
}
